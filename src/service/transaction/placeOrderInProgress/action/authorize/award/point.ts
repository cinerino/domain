/**
 * ポイントインセンティブ承認アクションサービス
 */
import * as factory from '../../../../../../factory';

import { MongoRepository as ActionRepo } from '../../../../../../repo/action';
import { MongoRepository as OwnershipInfoRepo } from '../../../../../../repo/ownershipInfo';
import { MongoRepository as TransactionRepo } from '../../../../../../repo/transaction';

export type ICreateOperation<T> = (repos: {
    action: ActionRepo;
    transaction: TransactionRepo;
    ownershipInfo: OwnershipInfoRepo;
}) => Promise<T>;

/**
 * ポイントインセンティブ承認
 */
export function create(params: {
    transaction: { id: string };
    agent: { id: string };
    object?: {
        potentialActions?: {
            givePointAwardParams?: factory.transaction.placeOrder.IGivePointAwardParams[];
        };
    };
}): ICreateOperation<void> {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
        ownershipInfo: OwnershipInfoRepo;
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
 * ポイントインセンティブ承認を取り消す
 */
export function cancel(params: {
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
