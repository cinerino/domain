/**
 * ポイントインセンティブ承認アクションサービス
 */
import * as pecorinoapi from '@pecorino/api-nodejs-client';
// import * as moment from 'moment';

import * as factory from '../../../../../../factory';

import { credentials } from '../../../../../../credentials';

import { handlePecorinoError } from '../../../../../../errorHandler';
import { MongoRepository as ActionRepo } from '../../../../../../repo/action';
import { MongoRepository as OwnershipInfoRepo } from '../../../../../../repo/ownershipInfo';
import { MongoRepository as ProjectRepo } from '../../../../../../repo/project';
import { MongoRepository as TransactionRepo } from '../../../../../../repo/transaction';

const pecorinoAuthClient = new pecorinoapi.auth.ClientCredentials({
    domain: credentials.pecorino.authorizeServerDomain,
    clientId: credentials.pecorino.clientId,
    clientSecret: credentials.pecorino.clientSecret,
    scopes: [],
    state: ''
});

export type ICreateOperation<T> = (repos: {
    action: ActionRepo;
    project: ProjectRepo;
    transaction: TransactionRepo;
    ownershipInfo: OwnershipInfoRepo;
}) => Promise<T>;

/**
 * ポイントインセンティブ承認
 */
export function create(params: {
    transaction: { id: string };
    agent: { id: string };
    object: factory.action.authorize.award.point.IObject;
}): ICreateOperation<factory.action.authorize.award.point.IAction> {
    return async (repos: {
        action: ActionRepo;
        project: ProjectRepo;
        transaction: TransactionRepo;
        ownershipInfo: OwnershipInfoRepo;
    }) => {
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transaction.id
        });

        const project = await repos.project.findById({ id: transaction.project.id });

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if: please write tests */
        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        if (transaction.agent.memberOf === undefined) {
            throw new factory.errors.Forbidden('Membership required');
        }

        if (project.settings === undefined || project.settings.pecorino === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
        }

        // 承認アクションを開始する
        const seller = transaction.seller;
        const actionAttributes: factory.action.authorize.award.point.IAttributes = {
            project: transaction.project,
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                typeOf: factory.action.authorize.award.point.ObjectType.PointAward,
                amount: params.object.amount,
                toAccountNumber: params.object.toAccountNumber,
                ...(params.object.notes !== undefined && params.object.notes !== null)
                    ? { notes: params.object.notes }
                    : {}
            },
            agent: {
                project: transaction.seller.project,
                id: transaction.seller.id,
                typeOf: seller.typeOf,
                name: seller.name,
                location: seller.location,
                telephone: seller.telephone,
                url: seller.url,
                image: seller.image
            },
            recipient: transaction.agent,
            purpose: { typeOf: transaction.typeOf, id: transaction.id }
        };
        const action = await repos.action.start(actionAttributes);

        const pointTransaction: factory.action.authorize.award.point.IPointTransaction | undefined = undefined;

        try {
            // pointTransaction = await processAuthorize({
            //     object: params.object,
            //     settings: project.settings.pecorino,
            //     transaction: transaction
            // });
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, name: error.name, message: error.message };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            error = handlePecorinoError(error);
            throw error;
        }

        // アクションを完了
        const actionResult: factory.action.authorize.award.point.IResult = {
            price: 0, // JPYとして0円
            amount: params.object.amount,
            ...(pointTransaction !== undefined) ? { pointTransaction } : undefined
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}

// async function processAuthorize(params: {
//     object: factory.action.authorize.award.point.IObject;
//     settings: factory.project.IPecorinoSettings;
//     transaction: factory.transaction.ITransaction<factory.transactionType.PlaceOrder>;
// }): Promise<factory.action.authorize.award.point.IPointTransaction> {
//     const depositService = new pecorinoapi.service.transaction.Deposit({
//         endpoint: params.settings.endpoint,
//         auth: pecorinoAuthClient
//     });

//     return depositService.start<factory.accountType.Point>({
//         project: { typeOf: params.transaction.project.typeOf, id: params.transaction.project.id },
//         typeOf: factory.pecorino.transactionType.Deposit,
//         agent: {
//             typeOf: params.transaction.seller.typeOf,
//             id: params.transaction.seller.id,
//             name: params.transaction.seller.name.ja,
//             url: params.transaction.seller.url
//         },
//         // 最大1日のオーソリ
//         expires: moment()
//             .add(1, 'day')
//             .toDate(),
//         recipient: {
//             typeOf: params.transaction.agent.typeOf,
//             id: params.transaction.agent.id,
//             name: `placeOrderTransaction-${params.transaction.id}`,
//             url: params.transaction.agent.url
//         },
//         object: {
//             amount: params.object.amount,
//             // tslint:disable-next-line:no-single-line-block-comment
//             description: (params.object.notes !== undefined)
//                 ? /* istanbul ignore next */ params.object.notes
//                 : '注文取引インセンティブ',
//             toLocation: {
//                 typeOf: factory.pecorino.account.TypeOf.Account,
//                 accountType: factory.accountType.Point,
//                 accountNumber: params.object.toAccountNumber
//             }
//         }
//     });
// }

/**
 * ポイントインセンティブ承認を取り消す
 */
export function cancel(params: {
    /**
     * 承認アクションID
     */
    id: string;
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
        project: ProjectRepo;
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

        const project = await repos.project.findById({ id: transaction.project.id });

        // 取引内のアクションかどうか確認
        let action = await repos.action.findById({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
        if (action.purpose.typeOf !== transaction.typeOf || action.purpose.id !== transaction.id) {
            throw new factory.errors.Argument('Transaction', 'Action not found in the transaction');
        }

        // まずアクションをキャンセル
        action = await repos.action.cancel({ typeOf: factory.actionType.AuthorizeAction, id: params.id });
        const actionResult = <factory.action.authorize.award.point.IResult>action.result;

        // Pecorinoで取引中止実行
        const pendingTransactionId = actionResult.pointTransaction?.id;
        if (typeof pendingTransactionId === 'string') {
            if (typeof project.settings?.pecorino?.endpoint !== 'string') {
                throw new factory.errors.ServiceUnavailable('Project settings not satisfied');
            }

            const depositService = new pecorinoapi.service.transaction.Deposit({
                endpoint: project.settings.pecorino.endpoint,
                auth: pecorinoAuthClient
            });
            await depositService.cancel({ id: pendingTransactionId });
        }
    };
}
