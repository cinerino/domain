/**
 * クレジットカード決済サービス
 */
import * as GMO from '@motionpicture/gmo-service';
import * as createDebug from 'debug';

import { credentials } from '../../credentials';

import * as chevre from '../../chevre';
import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as InvoiceRepo } from '../../repo/invoice';
import { MongoRepository as OrderRepo } from '../../repo/order';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { findPayActionByOrderNumber, onRefund } from './any';

const debug = createDebug('cinerino-domain:service');

const chevreAuthClient = new chevre.auth.ClientCredentials({
    domain: credentials.chevre.authorizeServerDomain,
    clientId: credentials.chevre.clientId,
    clientSecret: credentials.chevre.clientSecret,
    scopes: [],
    state: ''
});

export import IUncheckedCardRaw = factory.chevre.paymentMethod.paymentCard.creditCard.IUncheckedCardRaw;
export import IUncheckedCardTokenized = factory.chevre.paymentMethod.paymentCard.creditCard.IUncheckedCardTokenized;
export import IUnauthorizedCardOfMember = factory.chevre.paymentMethod.paymentCard.creditCard.IUnauthorizedCardOfMember;

export type IAuthorizeOperation<T> = (repos: {
    action: ActionRepo;
    project: ProjectRepo;
    transaction: TransactionRepo;
}) => Promise<T>;

/**
 * クレジットカードオーソリ取得
 */
export function authorize(params: {
    project: { id: string };
    agent: { id: string };
    object: factory.action.authorize.paymentMethod.creditCard.IObject;
    purpose: factory.action.authorize.paymentMethod.any.IPurpose;
}): IAuthorizeOperation<factory.action.authorize.paymentMethod.creditCard.IAction> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (project.settings === undefined || project.settings.gmo === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings not found');
        }

        const transaction = await repos.transaction.findInProgressById({ typeOf: params.purpose.typeOf, id: params.purpose.id });

        const sellerService = new chevre.service.Seller({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });
        const seller = await sellerService.findById({ id: String(transaction.seller.id) });

        const { shopId, shopPass } = getGMOInfoFromSeller({ seller: seller });

        // 取引番号生成
        const transactionNumberService = new chevre.service.TransactionNumber({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });

        const { transactionNumber } = await transactionNumberService.publish({
            project: { id: project.id }
        });

        // 承認アクションを開始する
        const actionAttributes: factory.action.authorize.paymentMethod.creditCard.IAttributes = {
            project: transaction.project,
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                ...params.object,
                paymentMethod: factory.paymentMethodType.CreditCard,
                paymentMethodId: transactionNumber,
                typeOf: factory.action.authorize.paymentMethod.any.ResultType.Payment
            },
            agent: transaction.agent,
            instrument: {
                typeOf: 'WebAPI',
                identifier: factory.action.authorize.paymentMethod.any.ServiceIdentifier.GMO
            },
            recipient: transaction.seller,
            purpose: { typeOf: transaction.typeOf, id: transaction.id }
        };
        const action = await repos.action.start(actionAttributes);

        // GMOオーソリ取得
        let authorizeResult: IAuthorizeResult;
        let searchTradeResult: GMO.services.credit.ISearchTradeResult | undefined;

        try {
            authorizeResult = await processAuthorizeCreditCard({
                project: project,
                shopId: shopId,
                shopPass: shopPass,
                orderId: transactionNumber,
                object: params.object
            });
        } catch (error) {
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // no op
            }

            throw handleAuthorizeError(error);
        }

        try {
            const creditCardService = new GMO.service.Credit({ endpoint: project.settings.gmo.endpoint });

            // ベストエフォートでクレジットカード詳細情報を取得
            searchTradeResult = await creditCardService.searchTrade({
                shopId: shopId,
                shopPass: shopPass,
                orderId: transactionNumber
            });
        } catch (error) {
            // no op
        }

        // アクションを完了
        const result: factory.action.authorize.paymentMethod.creditCard.IResult = {
            accountId: (searchTradeResult !== undefined) ? searchTradeResult.cardNo : '',
            amount: params.object.amount,
            paymentMethod: factory.paymentMethodType.CreditCard,
            paymentStatus: factory.paymentStatusType.PaymentDue,
            paymentMethodId: transactionNumber,
            name: (typeof params.object.name === 'string') ? params.object.name : String(factory.paymentMethodType.CreditCard),
            totalPaymentDue: {
                typeOf: 'MonetaryAmount',
                currency: factory.priceCurrency.JPY,
                value: params.object.amount
            },
            additionalProperty: (Array.isArray(params.object.additionalProperty)) ? params.object.additionalProperty : [],
            entryTranArgs: authorizeResult.entryTranArgs,
            entryTranResult: authorizeResult.entryTranResult,
            execTranArgs: authorizeResult.execTranArgs,
            execTranResult: authorizeResult.execTranResult,
            typeOf: factory.action.authorize.paymentMethod.any.ResultType.Payment
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: result });
    };
}

export interface IAuthorizeResult {
    entryTranArgs: GMO.services.credit.IEntryTranArgs;
    entryTranResult: GMO.services.credit.IEntryTranResult;
    execTranArgs: GMO.services.credit.IExecTranArgs;
    execTranResult: GMO.services.credit.IExecTranResult;
}

async function processAuthorizeCreditCard(params: {
    project: factory.project.IProject;
    shopId: string;
    shopPass: string;
    orderId: string;
    object: factory.action.authorize.paymentMethod.creditCard.IObject;
}): Promise<IAuthorizeResult> {
    const project = params.project;

    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore if */
    if (project.settings === undefined || project.settings.gmo === undefined) {
        throw new factory.errors.ServiceUnavailable('Project settings not found');
    }

    // GMOオーソリ取得
    let entryTranArgs: GMO.services.credit.IEntryTranArgs;
    let entryTranResult: GMO.services.credit.IEntryTranResult;
    let execTranArgs: GMO.services.credit.IExecTranArgs;
    let execTranResult: GMO.services.credit.IExecTranResult;

    const creditCardService = new GMO.service.Credit({ endpoint: project.settings.gmo.endpoint });

    entryTranArgs = {
        shopId: params.shopId,
        shopPass: params.shopPass,
        orderId: params.orderId,
        jobCd: GMO.utils.util.JobCd.Auth,
        amount: params.object.amount
    };

    entryTranResult = await creditCardService.entryTran(entryTranArgs);
    debug('entryTranResult:', entryTranResult);

    const creditCard = params.object.creditCard;
    execTranArgs = {
        accessId: entryTranResult.accessId,
        accessPass: entryTranResult.accessPass,
        orderId: params.orderId,
        method: params.object.method,
        siteId: project.settings.gmo.siteId,
        sitePass: project.settings.gmo.sitePass,
        cardNo: (<IUncheckedCardRaw>creditCard).cardNo,
        cardPass: (<IUncheckedCardRaw>creditCard).cardPass,
        expire: (<IUncheckedCardRaw>creditCard).expire,
        token: (<IUncheckedCardTokenized>creditCard).token,
        memberId: (<IUnauthorizedCardOfMember>creditCard).memberId,
        cardSeq: (<IUnauthorizedCardOfMember>creditCard).cardSeq,
        seqMode: GMO.utils.util.SeqMode.Physics
    };

    execTranResult = await creditCardService.execTran(execTranArgs);
    debug('execTranResult:', execTranResult);

    return {
        entryTranArgs,
        entryTranResult,
        execTranArgs,
        execTranResult
    };
}

function handleAuthorizeError(error: any) {
    let handledError: Error = error;

    if (error.name === 'GMOServiceBadRequestError') {
        // consider E92000001,E92000002
        // GMO流量制限オーバーエラーの場合
        const serviceUnavailableError = error.errors.find((gmoError: any) => gmoError.info.match(/^E92000001|E92000002$/));
        if (serviceUnavailableError !== undefined) {
            handledError = new factory.errors.RateLimitExceeded(serviceUnavailableError.userMessage);
        }

        // オーダーID重複エラーの場合
        const duplicateError = error.errors.find((gmoError: any) => gmoError.info.match(/^E01040010$/));
        if (duplicateError !== undefined) {
            handledError = new factory.errors.AlreadyInUse('orderId', [], duplicateError.userMessage);
        }

        // その他のGMOエラーに場合、なんらかのクライアントエラー
        handledError = new factory.errors.Argument('payment');
    }

    return handledError;
}

export function voidTransaction(params: {
    project: { id: string };
    agent: { id: string };
    id: string;
    purpose: factory.action.authorize.paymentMethod.any.IPurpose;
}) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (project.settings === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (project.settings.gmo === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings not found');
        }

        const transaction = await repos.transaction.findInProgressById({
            typeOf: params.purpose.typeOf,
            id: params.purpose.id
        });

        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        const sellerService = new chevre.service.Seller({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });
        const seller = await sellerService.findById({ id: String(transaction.seller.id) });

        const { shopId, shopPass } = getGMOInfoFromSeller({ seller: seller });

        // 取引内のアクションかどうか確認
        let action = await repos.action.findById({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
        if (action.purpose.typeOf !== transaction.typeOf || action.purpose.id !== transaction.id) {
            throw new factory.errors.Argument('Transaction', 'Action not found in the transaction');
        }

        action = <factory.action.authorize.paymentMethod.creditCard.IAction>
            await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.id });

        const orderId = action.object.paymentMethodId;
        const creditCardService = new GMO.service.Credit({ endpoint: project.settings.gmo.endpoint });

        // オーソリ取消
        // 現時点では、ここで失敗したらオーソリ取消をあきらめる
        // GMO混雑エラーはここでも発生する(取消処理でも混雑エラーが発生することは確認済)
        try {
            const searchTradeResult = await creditCardService.searchTrade({
                shopId: shopId,
                shopPass: shopPass,
                orderId: orderId
            });

            // 仮売上であれば取消
            if (searchTradeResult.status === GMO.utils.util.JobCd.Auth) {
                await creditCardService.alterTran({
                    shopId: shopId,
                    shopPass: shopPass,
                    accessId: searchTradeResult.accessId,
                    accessPass: searchTradeResult.accessPass,
                    jobCd: GMO.utils.util.JobCd.Void
                });
                debug('alterTran processed', GMO.utils.util.JobCd.Void);
            }
        } catch (error) {
            // no op
        }
    };
}

/**
 * クレジットカード売上確定
 */
export function payCreditCard(params: factory.task.IData<factory.taskName.Pay>) {
    return async (repos: {
        action: ActionRepo;
        invoice: InvoiceRepo;
        project: ProjectRepo;
    }): Promise<factory.action.trade.pay.IAction<factory.paymentMethodType.CreditCard>> => {
        const project = await repos.project.findById({ id: params.project.id });
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (project.settings === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (project.settings.gmo === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings not found');
        }

        // アクション開始
        const action = await repos.action.start(params);
        const alterTranResults: GMO.services.credit.IAlterTranResult[] = [];

        try {
            const creditCardService = new GMO.service.Credit({ endpoint: project.settings.gmo.endpoint });

            await Promise.all(params.object.map(async (paymentMethod) => {
                const entryTranArgs = paymentMethod.entryTranArgs;

                // 取引状態参照
                const searchTradeResult = await creditCardService.searchTrade({
                    shopId: entryTranArgs.shopId,
                    shopPass: entryTranArgs.shopPass,
                    orderId: entryTranArgs.orderId
                });

                if (searchTradeResult.jobCd === GMO.utils.util.JobCd.Sales) {
                    debug('already in SALES');
                    // すでに実売上済み
                    alterTranResults.push({
                        accessId: searchTradeResult.accessId,
                        accessPass: searchTradeResult.accessPass,
                        forward: searchTradeResult.forward,
                        approve: searchTradeResult.approve,
                        tranId: searchTradeResult.tranId,
                        tranDate: ''
                    });
                } else {
                    debug('calling alterTran...');
                    alterTranResults.push(await creditCardService.alterTran({
                        shopId: entryTranArgs.shopId,
                        shopPass: entryTranArgs.shopPass,
                        accessId: searchTradeResult.accessId,
                        accessPass: searchTradeResult.accessPass,
                        jobCd: GMO.utils.util.JobCd.Sales,
                        amount: paymentMethod.price
                    }));

                    // 失敗したら取引状態確認してどうこう、という処理も考えうるが、
                    // GMOはapiのコール制限が厳しく、下手にコールするとすぐにクライアントサイドにも影響をあたえてしまう
                    // リトライはタスクの仕組みに含まれているので失敗してもここでは何もしない
                }

                await repos.invoice.changePaymentStatus({
                    referencesOrder: { orderNumber: params.purpose.orderNumber },
                    paymentMethod: paymentMethod.paymentMethod.typeOf,
                    paymentMethodId: paymentMethod.paymentMethod.paymentMethodId,
                    paymentStatus: factory.paymentStatusType.PaymentComplete
                });
            }));
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        const actionResult: factory.action.trade.pay.IResult<factory.paymentMethodType.CreditCard> = {
            creditCardSales: alterTranResults
        };

        return <Promise<factory.action.trade.pay.IAction<factory.paymentMethodType.CreditCard>>>
            repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}

/**
 * クレジットカードオーソリ取消
 */
export function cancelCreditCardAuth(params: factory.task.IData<factory.taskName.VoidPayment>) {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
    }) => {
        const project = await repos.project.findById({ id: params.project.id });
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (project.settings === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (project.settings.gmo === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings not found');
        }

        const transaction = await repos.transaction.findById({
            typeOf: params.purpose.typeOf,
            id: params.purpose.id
        });

        const sellerService = new chevre.service.Seller({
            endpoint: credentials.chevre.endpoint,
            auth: chevreAuthClient
        });
        const seller = await sellerService.findById({ id: String(transaction.seller.id) });

        const { shopId, shopPass } = getGMOInfoFromSeller({ seller: seller });

        const creditCardService = new GMO.service.Credit({ endpoint: project.settings.gmo.endpoint });

        // クレジットカード仮売上アクションを取得
        let authorizeActions = <factory.action.authorize.paymentMethod.creditCard.IAction[]>await repos.action.searchByPurpose({
            typeOf: factory.actionType.AuthorizeAction,
            purpose: {
                typeOf: factory.transactionType.PlaceOrder,
                id: transaction.id
            }
        });
        authorizeActions = authorizeActions.filter((a) => a.object.paymentMethod === factory.paymentMethodType.CreditCard);

        // GMO流入量制限を考慮して、直列にゆっくり処理
        // await Promise.all(authorizeActions.map(async (action) => {
        // }));
        for (const action of authorizeActions) {
            // tslint:disable-next-line:no-magic-numbers
            await new Promise((resolve) => setTimeout(() => { resolve(); }, 1000));

            const orderId = action.object.paymentMethodId;

            if (typeof orderId === 'string') {
                // GMO取引が発生していれば取消
                const gmoTrade = await creditCardService.searchTrade({
                    shopId: shopId,
                    shopPass: shopPass,
                    orderId: orderId
                });

                // 仮売上であれば取消
                if (gmoTrade.status === GMO.utils.util.JobCd.Auth) {
                    await creditCardService.alterTran({
                        shopId: shopId,
                        shopPass: shopPass,
                        accessId: gmoTrade.accessId,
                        accessPass: gmoTrade.accessPass,
                        jobCd: GMO.utils.util.JobCd.Void
                    });
                }
            }

            await repos.action.cancel({ typeOf: action.typeOf, id: action.id });
        }

        // 失敗したら取引状態確認してどうこう、という処理も考えうるが、
        // GMOはapiのコール制限が厳しく、下手にコールするとすぐにクライアントサイドにも影響をあたえてしまう
        // リトライはタスクの仕組みに含まれているので失敗してもここでは何もしない
    };
}

/**
 * クレジットカード返金処理を実行する
 */
export function refundCreditCard(params: factory.task.IData<factory.taskName.Refund>) {
    return async (repos: {
        action: ActionRepo;
        order: OrderRepo;
        project: ProjectRepo;
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        // 本アクションに対応するPayActionを取り出す
        const payAction = await findPayActionByOrderNumber<factory.paymentMethodType.CreditCard>({
            object: { paymentMethod: factory.paymentMethodType.CreditCard, paymentMethodId: params.object.paymentMethodId },
            purpose: { orderNumber: params.purpose.orderNumber }
        })(repos);

        if (payAction === undefined) {
            throw new factory.errors.NotFound('PayAction');
        }

        const project = await repos.project.findById({ id: params.project.id });

        const refundActionAttributes = params;

        const returnOrderTransactions = await repos.transaction.search<factory.transactionType.ReturnOrder>({
            limit: 1,
            typeOf: factory.transactionType.ReturnOrder,
            object: { order: { orderNumbers: [refundActionAttributes.purpose.orderNumber] } }
        });
        const returnOrderTransaction = returnOrderTransactions.shift();
        if (returnOrderTransaction === undefined) {
            throw new factory.errors.NotFound('ReturnOrderTransaction');
        }

        const order = await repos.order.findByOrderNumber({
            orderNumber: refundActionAttributes.purpose.orderNumber
        });

        const action = await repos.action.start(refundActionAttributes);
        let alterTranResult: GMO.services.credit.IAlterTranResult[] = [];

        try {
            alterTranResult = await processChangeTransaction({
                project: project,
                payAction: payAction,
                cancellationFee: returnOrderTransaction.object.cancellationFee
            });
        } catch (error) {
            try {
                const actionError = { ...error, message: error.message, name: error.name };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // no op
            }

            throw error;
        }

        await repos.action.complete({ typeOf: action.typeOf, id: action.id, result: { alterTranResult } });

        // 潜在アクション
        await onRefund(refundActionAttributes, order)({ project: repos.project, task: repos.task });
    };
}

async function processChangeTransaction(params: {
    project: factory.project.IProject;
    payAction: factory.action.trade.pay.IAction<factory.paymentMethodType.CreditCard>;
    cancellationFee: number;
}): Promise<GMO.services.credit.IAlterTranResult[]> {
    const alterTranResult: GMO.services.credit.IAlterTranResult[] = [];

    const project = params.project;
    const payAction = params.payAction;

    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore if */
    if (project.settings === undefined || project.settings.gmo === undefined) {
        throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
    }

    const creditCardService = new GMO.service.Credit({ endpoint: project.settings.gmo.endpoint });
    await Promise.all(payAction.object.map(async (paymentMethod) => {
        const entryTranArgs = paymentMethod.entryTranArgs;

        // 取引状態参照
        const searchTradeResult = await creditCardService.searchTrade({
            shopId: entryTranArgs.shopId,
            shopPass: entryTranArgs.shopPass,
            orderId: entryTranArgs.orderId
        });
        debug('searchTradeResult is', searchTradeResult);

        let creditCardSalesBefore: GMO.services.credit.IAlterTranResult | undefined;
        if (payAction !== undefined && payAction.result !== undefined && payAction.result.creditCardSales !== undefined) {
            creditCardSalesBefore = payAction.result.creditCardSales[0];
        }
        if (creditCardSalesBefore === undefined) {
            throw new Error('Credit Card Sales not found');
        }

        // GMO取引状態に変更がなければ金額変更
        if (searchTradeResult.tranId === creditCardSalesBefore.tranId) {
            // 手数料0円であれば、決済取り消し(返品)処理
            if (params.cancellationFee === 0) {
                alterTranResult.push(await creditCardService.alterTran({
                    shopId: entryTranArgs.shopId,
                    shopPass: entryTranArgs.shopPass,
                    accessId: searchTradeResult.accessId,
                    accessPass: searchTradeResult.accessPass,
                    jobCd: GMO.utils.util.JobCd.Void
                }));
                debug('GMO alterTranResult is', alterTranResult);
            } else {
                const changeTranResult = await creditCardService.changeTran({
                    shopId: entryTranArgs.shopId,
                    shopPass: entryTranArgs.shopPass,
                    accessId: searchTradeResult.accessId,
                    accessPass: searchTradeResult.accessPass,
                    jobCd: GMO.utils.util.JobCd.Capture,
                    amount: params.cancellationFee
                });
                alterTranResult.push(changeTranResult);
            }
        } else {
            alterTranResult.push({
                accessId: searchTradeResult.accessId,
                accessPass: searchTradeResult.accessPass,
                forward: searchTradeResult.forward,
                approve: searchTradeResult.approve,
                tranId: searchTradeResult.tranId,
                tranDate: ''
            });
        }
    }));

    return alterTranResult;
}

function getGMOInfoFromSeller(params: {
    seller: factory.seller.ISeller;
}) {
    let creditCardPaymentAccepted: factory.seller.IPaymentAccepted<factory.paymentMethodType.CreditCard>;

    if (!Array.isArray(params.seller.paymentAccepted)) {
        throw new factory.errors.Argument('transaction', 'Credit card payment not accepted');
    }

    creditCardPaymentAccepted = <factory.seller.IPaymentAccepted<factory.paymentMethodType.CreditCard>>
        params.seller.paymentAccepted.find(
            (a) => a.paymentMethodType === factory.paymentMethodType.CreditCard
        );
    if (creditCardPaymentAccepted === undefined) {
        throw new factory.errors.Argument('transaction', 'Credit card payment not accepted');
    }
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore next */
    if (creditCardPaymentAccepted.gmoInfo.shopPass === undefined) {
        throw new factory.errors.Argument('transaction', 'Credit card payment settings not enough');
    }

    return {
        shopId: creditCardPaymentAccepted.gmoInfo.shopId,
        shopPass: creditCardPaymentAccepted.gmoInfo.shopPass,
        siteId: creditCardPaymentAccepted.gmoInfo.siteId
    };
}
