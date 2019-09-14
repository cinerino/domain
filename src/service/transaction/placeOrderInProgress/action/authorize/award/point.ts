/**
 * ポイントインセンティブ承認アクションサービス
 */
import * as pecorinoapi from '@pecorino/api-nodejs-client';
import * as createDebug from 'debug';
import * as moment from 'moment';

import * as factory from '../../../../../../factory';

import { credentials } from '../../../../../../credentials';

import { handlePecorinoError } from '../../../../../../errorHandler';
import { MongoRepository as ActionRepo } from '../../../../../../repo/action';
import { MongoRepository as OwnershipInfoRepo } from '../../../../../../repo/ownershipInfo';
import { MongoRepository as ProjectRepo } from '../../../../../../repo/project';
import { MongoRepository as TransactionRepo } from '../../../../../../repo/transaction';

const debug = createDebug('cinerino-domain:service');

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
    object: {
        /**
         * 金額
         */
        amount: number;
        /**
         * Pecorino口座番号
         */
        toAccountNumber: string;
        /**
         * 取引メモ
         */
        notes?: string;
    };
}): ICreateOperation<factory.action.authorize.award.point.IAction> {
    // tslint:disable-next-line:max-func-body-length
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
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
        }

        // インセンティブ付与可能条件は、会員プログラム特典に加入しているかどうか
        if (transaction.agent.memberOf === undefined) {
            throw new factory.errors.Forbidden('Membership required');
        }
        // const programMemberships = await repos.ownershipInfo.search({
        //     goodType: 'ProgramMembership',
        //     ownedBy: transaction.agent.id,
        //     ownedAt: new Date()
        // });
        // const pecorinoPaymentAward = programMemberships.reduce((a, b) => [...a, ...b.typeOfGood.award], [])
        //     .find((a) => a === factory.programMembership.Award.PointPayment);
        // if (pecorinoPaymentAward === undefined) {
        //     throw new factory.errors.Forbidden('Membership program requirements not satisfied');
        // }

        // 承認アクションを開始する
        const seller = transaction.seller;
        const actionAttributes: factory.action.authorize.award.point.IAttributes = {
            project: transaction.project,
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                typeOf: factory.action.authorize.award.point.ObjectType.PointAward,
                transactionId: params.transaction.id,
                amount: params.object.amount
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

        let pecorinoEndpoint: string;

        // Pecorinoオーソリ取得
        let pecorinoTransaction: factory.action.authorize.award.point.IPointTransaction;
        try {
            if (project.settings === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings undefined');
            }
            if (project.settings.pecorino === undefined) {
                throw new factory.errors.ServiceUnavailable('Project settings not found');
            }
            const depositService = new pecorinoapi.service.transaction.Deposit({
                endpoint: project.settings.pecorino.endpoint,
                auth: pecorinoAuthClient
            });
            pecorinoEndpoint = depositService.options.endpoint;

            debug('starting pecorino pay transaction...', params.object.amount);
            pecorinoTransaction = await depositService.start({
                typeOf: factory.pecorino.transactionType.Deposit,
                agent: {
                    typeOf: transaction.seller.typeOf,
                    id: transaction.seller.id,
                    name: transaction.seller.name.ja,
                    url: transaction.seller.url
                },
                // 最大1ヵ月のオーソリ
                expires: moment()
                    .add(1, 'month')
                    .toDate(),
                recipient: {
                    typeOf: transaction.agent.typeOf,
                    id: transaction.agent.id,
                    name: `placeOrderTransaction-${transaction.id}`,
                    url: transaction.agent.url
                },
                object: {
                    amount: params.object.amount,
                    // tslint:disable-next-line:no-single-line-block-comment
                    description: (params.object.notes !== undefined)
                        ? /* istanbul ignore next */ params.object.notes
                        : '注文取引インセンティブ',
                    toLocation: {
                        typeOf: factory.pecorino.account.TypeOf.Account,
                        accountType: factory.accountType.Point,
                        accountNumber: params.object.toAccountNumber
                    }
                }
            });
            debug('pecorinoTransaction started.', pecorinoTransaction.id);
        } catch (error) {
            // actionにエラー結果を追加
            try {
                // tslint:disable-next-line:max-line-length no-single-line-block-comment
                const actionError = { ...error, name: error.name, message: error.message };
                await repos.action.giveUp({ typeOf: action.typeOf, id: action.id, error: actionError });
            } catch (__) {
                // 失敗したら仕方ない
            }

            error = handlePecorinoError(error);
            throw error;
        }

        // アクションを完了
        debug('ending authorize action...');
        const actionResult: factory.action.authorize.award.point.IResult = {
            price: 0, // JPYとして0円
            amount: params.object.amount,
            pointTransaction: pecorinoTransaction,
            pointAPIEndpoint: pecorinoEndpoint
        };

        return repos.action.complete({ typeOf: action.typeOf, id: action.id, result: actionResult });
    };
}

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
        debug('canceling pecorino authorize action...');
        const transaction = await repos.transaction.findInProgressById({
            typeOf: factory.transactionType.PlaceOrder,
            id: params.transaction.id
        });

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('A specified transaction is not yours.');
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
        if (project.settings === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }
        if (project.settings.pecorino === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings not found');
        }
        const depositService = new pecorinoapi.service.transaction.Deposit({
            endpoint: project.settings.pecorino.endpoint,
            auth: pecorinoAuthClient
        });
        await depositService.cancel(actionResult.pointTransaction);
    };
}
