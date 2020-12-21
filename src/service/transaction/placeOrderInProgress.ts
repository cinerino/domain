/**
 * 進行中注文取引サービス
 */
import { credentials } from '../../credentials';

import * as chevre from '../../chevre';
import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { RedisRepository as ConfirmationNumberRepo } from '../../repo/confirmationNumber';
import { RedisRepository as OrderNumberRepo } from '../../repo/orderNumber';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { createAttributes } from './placeOrderInProgress/factory';
import { createPotentialActions } from './placeOrderInProgress/potentialActions';
import { createConfirmationNumber4identifier, createOrder } from './placeOrderInProgress/result';
import {
    validateEventOffers,
    validateNumItems,
    validateTransaction,
    validateWaiterPassport
} from './placeOrderInProgress/validation';

import { MongoErrorCode } from '../../errorHandler';

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

export const AWARD_ACCOUNT_NUMBER_IDENTIFIER_NAME = 'awardAccountNumber';

export type IStartOperation<T> = (repos: {
    project: ProjectRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

export type IPassportValidator = (params: { passport: factory.waiter.passport.IPassport }) => boolean;
export type IStartParams = factory.transaction.placeOrder.IStartParamsWithoutDetail & {
    passportValidator?: IPassportValidator;
};

/**
 * 取引開始
 */
export function start(params: IStartParams): IStartOperation<factory.transaction.placeOrder.ITransaction> {
    return async (repos: {
        project: ProjectRepo;
        transaction: TransactionRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });

        const sellerService = new chevre.service.Seller({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });
        const seller = await sellerService.findById({ id: params.seller.id });

        const passport = await validateWaiterPassport(params);

        // 注文通知パラメータ作成
        const informOrderParams = createInformOrderParams({ ...params, project: project });

        // 取引ファクトリーで新しい進行中取引オブジェクトを作成
        const transactionAttributes = createAttributes(params, passport, informOrderParams, seller);

        let transaction: factory.transaction.placeOrder.ITransaction;
        try {
            transaction = await repos.transaction.start<factory.transactionType.PlaceOrder>(transactionAttributes);
        } catch (error) {
            if (error.name === 'MongoError') {
                // no op
            }

            throw error;
        }

        return transaction;
    };
}

function createInformOrderParams(params: IStartParams & {
    project: factory.project.IProject;
}): factory.transaction.placeOrder.IInformOrderParams[] {
    const informOrderParamsByProject = params.project.settings?.onOrderStatusChanged?.informOrder;
    const informOrderParamsByCustomer = params.object?.onOrderStatusChanged?.informOrder;

    return [
        ...(Array.isArray(informOrderParamsByProject)) ? informOrderParamsByProject : [],
        ...(Array.isArray(informOrderParamsByCustomer)) ? informOrderParamsByCustomer : []
    ];
}

export type IConfirmationNumberGenerator = (order: factory.order.IOrder) => string;

export type IOrderURLGenerator = (order: factory.order.IOrder) => string;

export type IResultOrderParams = factory.transaction.placeOrder.IResultOrderParams & {
    /**
     * 注文日時
     */
    orderDate: Date;
    /**
     * 注文確認URLのカスタム指定
     */
    url?: string | IOrderURLGenerator;
    /**
     * 注文アイテム数
     */
    numItems?: {
        maxValue?: number;
        minValue?: number;
    };
};

export type IConfirmParams = factory.transaction.placeOrder.IConfirmParams & {
    project: { id: string };
    result: {
        order: IResultOrderParams;
    };
};

/**
 * 注文取引を確定する
 */
export function confirm(params: IConfirmParams) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
        orderNumber: OrderNumberRepo;
        confirmationNumber: ConfirmationNumberRepo;
    }) => {
        let transaction = await repos.transaction.findById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.id
        });

        if (transaction.status === factory.transactionStatusType.Confirmed) {
            // すでに確定済の場合
            return <factory.transaction.placeOrder.IResult>transaction.result;
        } else if (transaction.status === factory.transactionStatusType.Expired) {
            throw new factory.errors.Argument('transactionId', 'Transaction already expired');
        } else if (transaction.status === factory.transactionStatusType.Canceled) {
            throw new factory.errors.Argument('transactionId', 'Transaction already canceled');
        }

        if (typeof params.agent?.id === 'string' && transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        const project = await repos.project.findById({ id: transaction.project.id });

        const sellerService = new chevre.service.Seller({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });
        const seller = await sellerService.findById({ id: String(transaction.seller.id) });

        // プロジェクトの対応決済サービスを確認するためにChevreプロジェクトを検索
        const productService = new chevre.service.Product({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });
        const searchPaymentServicesResult = await productService.search({
            project: { id: { $eq: transaction.project.id } },
            typeOf: {
                $in: [
                    chevre.factory.service.paymentService.PaymentServiceType.CreditCard,
                    chevre.factory.service.paymentService.PaymentServiceType.MovieTicket
                ]
            }
        });
        const paymentServices = <chevre.factory.service.paymentService.IService[]>searchPaymentServicesResult.data;

        // 利用可能な口座区分を検索
        const categoryCodeService = new chevre.service.CategoryCode({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });
        const searchAccountTypesResult = await categoryCodeService.search({
            project: { id: { $eq: project.id } },
            inCodeSet: { identifier: { $eq: factory.chevre.categoryCode.CategorySetIdentifier.AccountType } }
        });

        // 取引に対する全ての承認アクションをマージ
        transaction.object.authorizeActions = await searchAuthorizeActions(params)(repos);

        // 注文番号を発行
        const orderNumber = await publishOrderNumberIfNotExist({
            id: transaction.id,
            object: { orderDate: params.result.order.orderDate }
        })(repos);

        const result = await createResult({
            ...params,
            orderNumber,
            transaction: transaction,
            paymentServices: paymentServices,
            accountTypes: searchAccountTypesResult.data
        })(repos);

        // ポストアクションを作成
        const potentialActions = await createPotentialActions({
            transaction: transaction,
            order: result.order,
            seller: seller,
            potentialActions: params.potentialActions
        });

        // ステータス変更
        try {
            transaction = await repos.transaction.confirm({
                typeOf: transaction.typeOf,
                id: transaction.id,
                authorizeActions: transaction.object.authorizeActions,
                result: result,
                potentialActions: potentialActions
            });
        } catch (error) {
            if (error.name === 'MongoError') {
                // 万が一同一注文番号で確定しようとすると、MongoDBでE11000 duplicate key errorが発生する
                // message: 'E11000 duplicate key error collection: prodttts.transactions index:result.order.orderNumber_1 dup key:...',
                if (error.code === MongoErrorCode.DuplicateKey) {
                    throw new factory.errors.AlreadyInUse('transaction', ['result.order.orderNumber']);
                }
            }

            throw error;
        }

        return <factory.transaction.placeOrder.IResult>transaction.result;
    };
}

/**
 * 未発行であれば、注文の確認番号を発行して取引に補完する
 */
export function publishConfirmationNumberIfNotExist(params: {
    /**
     * 取引ID
     */
    id: string;
    object: {
        orderDate: Date;
    };
}) {
    return async (repos: {
        transaction: TransactionRepo;
        confirmationNumber: ConfirmationNumberRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.id
        });

        // すでに発行済であれば何もしない
        if (typeof transaction.object.confirmationNumber === 'string') {
            return;
        }

        // 確認番号を発行
        const confirmationNumber = (await repos.confirmationNumber.publish({
            orderDate: params.object.orderDate
        })).toString();

        // 取引に存在しなければ保管
        await repos.transaction.transactionModel.findOneAndUpdate(
            {
                _id: transaction.id,
                'object.confirmationNumber': { $exists: false }
            },
            { 'object.confirmationNumber': confirmationNumber }
        )
            .exec();
    };
}

/**
 * 未発行であれば、注文番号を発行して取引に補完する
 */
export function publishOrderNumberIfNotExist(params: {
    /**
     * 取引ID
     */
    id: string;
    object: {
        orderDate: Date;
    };
}) {
    return async (repos: {
        transaction: TransactionRepo;
        orderNumber: OrderNumberRepo;
    }): Promise<string> => {
        let transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.id
        });

        // すでに発行済であれば何もしない
        if (typeof transaction.object.orderNumber === 'string') {
            return transaction.object.orderNumber;
        }

        // 注文番号を発行
        const orderNumber = await repos.orderNumber.publishByTimestamp({
            project: { id: transaction.project.id },
            orderDate: params.object.orderDate
        });

        // 取引に存在しなければ保管
        await repos.transaction.transactionModel.findOneAndUpdate(
            {
                _id: transaction.id,
                'object.orderNumber': { $exists: false }
            },
            { 'object.orderNumber': orderNumber },
            { new: true }
        )
            .exec();

        // 注文番号を取引から再取得
        transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.id
        });

        return <string>transaction.object.orderNumber;
    };
}

function createResult(params: IConfirmParams & {
    orderNumber: string;
    transaction: factory.transaction.ITransaction<factory.transactionType.PlaceOrder>;
    paymentServices?: factory.chevre.service.paymentService.IService[];
    accountTypes?: factory.chevre.categoryCode.ICategoryCode[];
}) {
    return async (repos: {
        confirmationNumber: ConfirmationNumberRepo;
    }): Promise<factory.transaction.placeOrder.IResult> => {
        const transaction = params.transaction;

        // 取引の確定条件が全て整っているかどうか確認
        validateTransaction(transaction, params.paymentServices, params.accountTypes);

        // 注文作成
        const order = createOrder({
            orderNumber: params.orderNumber,
            transaction: transaction,
            orderDate: params.result.order.orderDate,
            orderStatus: factory.orderStatus.OrderProcessing,
            isGift: false
        });

        validateEventOffers({
            transaction: transaction,
            order: order
        });

        // 注文アイテム数制限確認
        validateNumItems({
            order: order,
            result: params.result
        });

        // 確認番号を発行
        const { confirmationNumber, identifier, url } = await createConfirmationNumber({
            order: order,
            transaction: transaction,
            result: params.result
        })(repos);

        order.confirmationNumber = confirmationNumber;
        order.identifier = identifier;
        order.url = url;

        return { order };
    };
}

function searchAuthorizeActions(params: IConfirmParams) {
    return async (repos: {
        action: ActionRepo;
    }) => {
        // 取引に対する全ての承認アクションをマージ
        let authorizeActions = await repos.action.searchByPurpose({
            typeOf: factory.actionType.AuthorizeAction,
            purpose: {
                typeOf: factory.transactionType.PlaceOrder,
                id: params.id
            }
        });

        // 万が一このプロセス中に他処理が発生してもそれらを無視するように、endDateでフィルタリング
        authorizeActions = authorizeActions.filter((a) => (a.endDate !== undefined && a.endDate < params.result.order.orderDate));

        return authorizeActions;
    };
}

function createConfirmationNumber(params: {
    order: factory.order.IOrder;
    transaction: factory.transaction.ITransaction<factory.transactionType.PlaceOrder>;
    result: {
        order: IResultOrderParams;
    };
}) {
    return async (repos: {
        confirmationNumber: ConfirmationNumberRepo;
    }): Promise<{
        confirmationNumber: string;
        url: string;
        identifier: factory.order.IIdentifier;
    }> => {
        let confirmationNumber = params.transaction.object.confirmationNumber;
        let url = '';
        let identifier: factory.order.IIdentifier = [];

        // 取引に確認番号が保管されていなければ、確認番号を発行
        if (typeof confirmationNumber !== 'string') {
            confirmationNumber = (await repos.confirmationNumber.publish({
                orderDate: params.result.order.orderDate
            })).toString();
        }

        // URLの指定があれば上書き
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (typeof params.result.order.url === 'string') {
            url = params.result.order.url;
        } else /* istanbul ignore next */ if (typeof params.result.order.url === 'function') {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore next */
            url = params.result.order.url(params.order);
        }

        const { confirmationNumber4identifier, confirmationPass } = createConfirmationNumber4identifier({
            confirmationNumber: confirmationNumber,
            order: params.order
        });

        // 識別子の指定があれば上書き
        identifier = [
            ...(Array.isArray(params.result.order.identifier)) ? params.result.order.identifier : [],
            // 取引に指定があれば追加
            ...(Array.isArray((<any>params.transaction.object).identifier)) ? (<any>params.transaction.object).identifier : [],
            { name: 'paymentNo', value: confirmationNumber },
            { name: 'confirmationNumber', value: confirmationNumber4identifier },
            { name: 'confirmationPass', value: confirmationPass }
        ];

        return { confirmationNumber, url, identifier };
    };
}

/**
 * インセンティブ承認
 */
export function authorizeAward(params: {
    transaction: { id: string };
    agent: { id: string };
    object?: {
        potentialActions?: {
            givePointAwardParams?: factory.transaction.placeOrder.IGivePointAwardParams[];
        };
    };
}) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transaction.id
        });

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if: please write tests */
        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        if (transaction.agent.memberOf === undefined) {
            throw new factory.errors.Forbidden('Membership required');
        }

        if (Array.isArray(params.object?.potentialActions?.givePointAwardParams)) {
            // 取引にインセンティブ付与アクションパラメータを保管する
            await repos.transaction.transactionModel.findOneAndUpdate(
                { _id: transaction.id },
                { 'object.potentialActions.givePointAward': params.object?.potentialActions?.givePointAwardParams }
            )
                .exec();
        }
    };
}

/**
 * インセンティブ承認を取り消す
 */
export function voidAward(params: {
    /**
     * 取引進行者
     */
    agent: { id: string };
    /**
     * 取引
     */
    transaction: { id: string };
}) {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transaction.id
        });

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        await repos.transaction.transactionModel.findOneAndUpdate(
            { _id: transaction.id },
            {
                $unset: {
                    'object.potentialActions.givePointAward': 1
                }
            }
        )
            .exec();
    };
}

/**
 * 未発行であれば、注文に割り当てられるインセンティブ口座の識別子を発行する
 */
export function publishAwardAccountNumberIfNotExist(params: {
    /**
     * 取引ID
     */
    id: string;
}) {
    return async (repos: {
        transaction: TransactionRepo;
    }): Promise<string> => {
        let transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.id
        });

        // すでに発行済であれば何もしない
        if (Array.isArray((<any>transaction.object).identifier)
            && (<any[]>(<any>transaction.object).identifier).some((i) => i.name === AWARD_ACCOUNT_NUMBER_IDENTIFIER_NAME)) {
            return (<any[]>(<any>transaction.object).identifier).find((i) => i.name === AWARD_ACCOUNT_NUMBER_IDENTIFIER_NAME)?.value;
        }

        // 注文番号を発行
        const serviceOutputService = new chevre.service.ServiceOutput({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });

        const publishIdentifierResult = await serviceOutputService.publishIdentifier([
            { project: { id: transaction.project.id } }
        ]);

        // 取引に存在しなければ保管
        await repos.transaction.transactionModel.findOneAndUpdate(
            {
                _id: transaction.id,
                'object.identifier.name': { $ne: AWARD_ACCOUNT_NUMBER_IDENTIFIER_NAME }
            },
            {
                $push: { 'object.identifier': { name: AWARD_ACCOUNT_NUMBER_IDENTIFIER_NAME, value: publishIdentifierResult[0].identifier } }
            },
            { new: true }
        )
            .exec();

        // 取引から再取得
        transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.id
        });

        return (<any[]>(<any>transaction.object).identifier).find((i) => i.name === AWARD_ACCOUNT_NUMBER_IDENTIFIER_NAME)?.value;
    };
}
