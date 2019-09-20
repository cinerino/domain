/**
 * ttts専用進行中注文取引サービス
 */
import * as waiter from '@waiter/domain';
import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
// import { RedisRepository as ConfirmationNumberRepo } from '../../repo/confirmationNumber';
import { RedisRepository as OrderNumberRepo } from '../../repo/orderNumber';
import { MongoRepository as SellerRepo } from '../../repo/seller';
import { RedisRepository as TokenRepo } from '../../repo/token';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as SeatReservationAuthorizeActionService from './placeOrderInProgress/action/authorize/offer/seatReservation4ttts';

import { createPotentialActions } from './placeOrderInProgress/potentialActions4ttts';
import { createOrder } from './placeOrderInProgress/result4ttts';

const project = { typeOf: <'Project'>'Project', id: <string>process.env.PROJECT_ID };

export type ITransactionOperation<T> = (repos: { transaction: TransactionRepo }) => Promise<T>;
export type IStartOperation<T> = (repos: {
    seller: SellerRepo;
    transaction: TransactionRepo;
}) => Promise<T>;
export type IConfirmOperation<T> = (repos: {
    action: ActionRepo;
    orderNumber: OrderNumberRepo;
    transaction: TransactionRepo;
    token: TokenRepo;
}) => Promise<T>;

/**
 * 取引開始パラメーターインターフェース
 */
// export interface IStartParams {
//     /**
//      * 取引期限
//      */
//     expires: Date;
//     /**
//      * 取引主体
//      */
//     agent: factory.person.IPerson;
//     /**
//      * 販売者識別子
//      */
//     sellerIdentifier: string;
//     /**
//      * APIクライアント
//      */
//     clientUser: factory.clientUser.IClientUser;
//     /**
//      * WAITER許可証トークン
//      */
//     passportToken?: waiter.factory.passport.IEncodedPassport;
// }
export type IPassportValidator = (params: { passport: factory.waiter.passport.IPassport }) => boolean;
export type IStartParams = factory.transaction.placeOrder.IStartParamsWithoutDetail & {
    passportValidator?: IPassportValidator;
};

/**
 * 取引開始
 */
export function start(params: IStartParams): IStartOperation<factory.transaction.placeOrder.ITransaction> {
    return async (repos: {
        seller: SellerRepo;
        transaction: TransactionRepo;
    }) => {
        // 販売者を取得
        const seller = await repos.seller.findById({ id: params.seller.id });
        // const doc = await sellerRepo.organizationModel.findOne({
        //     identifier: params.sellerIdentifier
        // })
        //     .exec();
        // if (doc === null) {
        //     throw new factory.errors.NotFound('Seller');
        // }

        // const seller = <factory.seller.IOrganization<factory.seller.IAttributes<factory.organizationType.Corporation>>>doc.toObject();

        let passport: waiter.factory.passport.IPassport | undefined;

        // WAITER許可証トークンがあれば検証する
        if (params.object.passport !== undefined) {
            try {
                passport = await waiter.service.passport.verify({
                    token: params.object.passport.token,
                    secret: <string>process.env.WAITER_SECRET
                });
            } catch (error) {
                throw new factory.errors.Argument('passportToken', `Invalid token. ${error.message}`);
            }

            // スコープを判別
            if (seller.identifier === undefined || !validatePassport(passport, seller.identifier)) {
                throw new factory.errors.Argument('passportToken', 'Invalid passport.');
            }
        }

        // 新しい進行中取引を作成
        const transactionAttributes: factory.transaction.placeOrder.IAttributes = {
            project: project,
            typeOf: factory.transactionType.PlaceOrder,
            status: factory.transactionStatusType.InProgress,
            agent: params.agent,
            seller: {
                project: project,
                typeOf: seller.typeOf,
                id: seller.id,
                name: seller.name,
                url: seller.url
            },
            object: {
                passportToken: (params.object.passport !== undefined) ? params.object.passport.token : undefined,
                passport: passport,
                clientUser: params.object.clientUser,
                authorizeActions: []
            },
            expires: params.expires,
            startDate: new Date(),
            tasksExportationStatus: factory.transactionTasksExportationStatus.Unexported
        };

        let transaction: factory.transaction.placeOrder.ITransaction;
        try {
            transaction = await repos.transaction.start<factory.transactionType.PlaceOrder>(transactionAttributes);
            // transaction = <any>await repos.transaction.start(<any>transactionAttributes);
        } catch (error) {
            if (error.name === 'MongoError') {
                // 許可証を重複使用しようとすると、MongoDBでE11000 duplicate key errorが発生する
                // name: 'MongoError',
                // message: 'E11000 duplicate key error collection: ttts-development-v2.transactions...',
                // code: 11000,

                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                // tslint:disable-next-line:no-magic-numbers
                if (error.code === 11000) {
                    throw new factory.errors.AlreadyInUse('transaction', ['passportToken'], 'Passport already used.');
                }
            }

            throw error;
        }

        return transaction;
    };
}

/**
 * WAITER許可証の有効性チェック
 * @param passport WAITER許可証
 * @param sellerIdentifier 販売者識別子
 */
function validatePassport(passport: waiter.factory.passport.IPassport, sellerIdentifier: string) {
    const WAITER_PASSPORT_ISSUER = process.env.WAITER_PASSPORT_ISSUER;
    if (WAITER_PASSPORT_ISSUER === undefined) {
        throw new Error('WAITER_PASSPORT_ISSUER unset');
    }
    const issuers = WAITER_PASSPORT_ISSUER.split(',');
    const validIssuer = issuers.indexOf(passport.iss) >= 0;

    // スコープのフォーマットは、placeOrderTransaction.{sellerId}
    const explodedScopeStrings = passport.scope.split('.');
    const validScope = (
        explodedScopeStrings[0] === 'placeOrderTransaction' && // スコープ接頭辞確認
        explodedScopeStrings[1] === sellerIdentifier // 販売者識別子確認
    );

    return validIssuer && validScope;
}

/**
 * 取引中の購入者情報を変更する
 */
export function updateAgent(params: {
    id: string;
    agent: factory.transaction.placeOrder.IAgent;
}): ITransactionOperation<factory.transaction.placeOrder.IAgent> {
    return async (repos: { transaction: TransactionRepo }) => {
        let formattedTelephone: string;
        try {
            const phoneUtil = PhoneNumberUtil.getInstance();
            // addressが国コード
            const phoneNumber = phoneUtil.parse(params.agent.telephone, params.agent.address);
            if (!phoneUtil.isValidNumber(phoneNumber)) {
                throw new Error('invalid phone number format.');
            }

            formattedTelephone = phoneUtil.format(phoneNumber, PhoneNumberFormat.E164);
        } catch (error) {
            throw new factory.errors.Argument('contact.telephone', error.message);
        }

        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.id
        });

        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }

        // 新プロフィールを生成
        const newAgent: factory.transaction.placeOrder.IAgent = {
            typeOf: transaction.agent.typeOf,
            id: transaction.agent.id,
            email: params.agent.email,
            age: params.agent.age,
            address: params.agent.address,
            gender: params.agent.gender,
            givenName: params.agent.givenName,
            familyName: params.agent.familyName,
            telephone: formattedTelephone
        };

        await repos.transaction.updateAgent({
            typeOf: transaction.typeOf,
            id: transaction.id,
            agent: newAgent
        });

        return newAgent;
    };
}

/**
 * 取引確定
 */
export function confirm(params: {
    id: string;
    agent?: {
        id?: string;
    };
    /**
     * 取引確定後アクション
     */
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    result: {
        order: {
            orderDate: Date;
            /**
             * 確認番号のカスタム指定
             */
            confirmationNumber?: string;
        };
    };
}): IConfirmOperation<factory.transaction.placeOrder.IResult> {
    return async (repos: {
        action: ActionRepo;
        orderNumber: OrderNumberRepo;
        token: TokenRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.id
        });

        if (params.agent !== undefined && typeof params.agent.id === 'string') {
            if (transaction.agent.id !== params.agent.id) {
                throw new factory.errors.Forbidden('A specified transaction is not yours');
            }
        }

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
        transaction.object.authorizeActions = authorizeActions;

        // 注文取引成立条件を満たしているかどうか
        if (!canBeClosed(transaction)) {
            throw new factory.errors.Argument('transactionId', 'Transaction cannot be confirmed because prices are not matched.');
        }

        const orderNumber = await repos.orderNumber.publishByTimestamp({
            project: project,
            orderDate: params.result.order.orderDate
        });

        // 確認番号を発行
        let confirmationNumber = '0';

        // 確認番号の指定があれば上書き
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (typeof params.result.order.confirmationNumber === 'string') {
            confirmationNumber = params.result.order.confirmationNumber;
        }

        // 注文作成
        const { order } = createOrder(confirmationNumber, orderNumber, transaction);

        const result: factory.transaction.placeOrder.IResult = { order };

        const potentialActions = await createPotentialActions({
            transaction: transaction,
            order: order,
            potentialActions: params.potentialActions
        });

        // 印刷トークンを発行
        const printToken = await repos.token.createPrintToken(
            order.acceptedOffers.map((o) => (<factory.order.IReservation>o.itemOffered).id)
        );

        // ステータス変更
        try {
            await repos.transaction.confirm({
                typeOf: transaction.typeOf,
                id: transaction.id,
                authorizeActions: authorizeActions,
                result: result,
                potentialActions: potentialActions
            });
        } catch (error) {
            if (error.name === 'MongoError') {
                // 万が一同一注文番号で確定しようとすると、MongoDBでE11000 duplicate key errorが発生する
                // name: 'MongoError',
                // message: 'E11000 duplicate key error collection: prodttts.transactions index:result.order.orderNumber_1 dup key:...',
                // code: 11000,
                // tslint:disable-next-line:no-magic-numbers
                if (error.code === 11000) {
                    throw new factory.errors.AlreadyInUse('transaction', ['result.order.orderNumber']);
                }
            }

            throw error;
        }

        return {
            order: order,
            printToken: printToken
        };
    };
}

/**
 * 取引が確定可能な状態かどうかをチェックする
 */
function canBeClosed(
    transaction: factory.transaction.placeOrder.ITransaction
) {
    // customerとsellerで、承認アクションの金額が合うかどうか
    const priceByAgent = transaction.object.authorizeActions
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.agent.id === transaction.agent.id)
        .reduce((a, b) => a + Number((<factory.action.authorize.paymentMethod.creditCard.IResult>b.result).amount), 0);
    const priceBySeller = transaction.object.authorizeActions
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) => a.agent.id === transaction.seller.id)
        // tslint:disable-next-line:max-line-length
        .reduce((a, b) => a + (<factory.action.authorize.offer.seatReservation.IResult<factory.service.webAPI.Identifier.Chevre>>b.result).price, 0);

    if (priceByAgent !== priceBySeller) {
        throw new factory.errors.Argument('transactionId', 'Prices not matched between an agent and a seller.');
    }

    return true;
}

/**
 * 取引に対するアクション
 */
export namespace action {
    /**
     * 取引に対する承認アクション
     */
    export namespace authorize {
        /**
         * 座席予約承認アクションサービス
         */
        export import seatReservation = SeatReservationAuthorizeActionService;
    }
}
