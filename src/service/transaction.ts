/**
 * 取引サービス
 */
import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';

import * as factory from '../factory';

import { MongoRepository as ProjectRepo } from '../repo/project';
import { MongoRepository as TaskRepo } from '../repo/task';
import { MongoRepository as TransactionRepo } from '../repo/transaction';

import * as MoneyTransferTransactionService from './transaction/moneyTransfer';
import * as OrderAccountService from './transaction/orderAccount';
import * as PlaceOrderTransactionService from './transaction/placeOrder';
import * as PlaceOrderInProgressTransactionService from './transaction/placeOrderInProgress';
import * as ReturnOrderTransactionService from './transaction/returnOrder';

export import moneyTransfer = MoneyTransferTransactionService;
export import orderAccount = OrderAccountService;
export import placeOrder = PlaceOrderTransactionService;
export import placeOrderInProgress = PlaceOrderInProgressTransactionService;
export import returnOrder = ReturnOrderTransactionService;

export type ITransactionOperation<T> = (repos: { transaction: TransactionRepo }) => Promise<T>;

/**
 * 取引人プロフィール更新
 */
export function updateAgent(params: {
    typeOf: factory.transactionType;
    id: string;
    agent: factory.transaction.placeOrder.IAgent & {
        telephoneRegion?: string;
    };
}): ITransactionOperation<factory.transaction.placeOrder.IAgent> {
    // tslint:disable-next-line:cyclomatic-complexity
    return async (repos: { transaction: TransactionRepo }) => {
        let formattedTelephone: string;
        try {
            const phoneUtil = PhoneNumberUtil.getInstance();
            const phoneNumber = phoneUtil.parse(params.agent.telephone, params.agent.telephoneRegion);
            if (!phoneUtil.isValidNumber(phoneNumber)) {
                throw new Error('Invalid phone number');
            }
            formattedTelephone = phoneUtil.format(phoneNumber, PhoneNumberFormat.E164);
        } catch (error) {
            throw new factory.errors.Argument('telephone', error.message);
        }

        const transaction = await repos.transaction.findInProgressById({
            typeOf: params.typeOf,
            id: params.id
        });

        if (transaction.agent.id !== params.agent.id) {
            throw new factory.errors.Forbidden('Transaction not yours');
        }

        // 新プロフィール作成
        const newAgent: factory.transaction.placeOrder.IAgent = {
            typeOf: transaction.agent.typeOf,
            id: transaction.agent.id,
            ...(Array.isArray(params.agent.additionalProperty)) ? { additionalProperty: params.agent.additionalProperty } : {},
            ...(typeof params.agent.age === 'string') ? { age: params.agent.age } : {},
            ...(typeof params.agent.address === 'string') ? { address: params.agent.address } : {},
            ...(typeof params.agent.email === 'string') ? { email: params.agent.email } : {},
            ...(typeof params.agent.familyName === 'string') ? { familyName: params.agent.familyName } : {},
            ...(typeof params.agent.gender === 'string') ? { gender: params.agent.gender } : {},
            ...(typeof params.agent.givenName === 'string') ? { givenName: params.agent.givenName } : {},
            ...(typeof params.agent.name === 'string') ? { name: params.agent.name } : {},
            ...(typeof formattedTelephone === 'string') ? { telephone: formattedTelephone } : {},
            ...(typeof params.agent.url === 'string') ? { url: params.agent.url } : {}
        };

        // 注文取引の場合、object.customerにも適用
        let customer: factory.order.ICustomer | undefined;
        if (transaction.typeOf === factory.transactionType.PlaceOrder) {
            // いったんtransaction.object.customer?.typeOfは取引開始時にセットされている前提
            if (typeof transaction.object.customer?.typeOf === 'string') {
                customer = {
                    typeOf: transaction.object.customer?.typeOf,
                    id: transaction.object.customer?.id,
                    ...(Array.isArray(params.agent.additionalProperty)) ? { additionalProperty: params.agent.additionalProperty } : {},
                    ...(typeof params.agent.age === 'string') ? { age: params.agent.age } : {},
                    ...(typeof params.agent.address === 'string') ? { address: params.agent.address } : {},
                    ...(typeof params.agent.email === 'string') ? { email: params.agent.email } : {},
                    ...(typeof params.agent.familyName === 'string') ? { familyName: params.agent.familyName } : {},
                    ...(typeof params.agent.gender === 'string') ? { gender: params.agent.gender } : {},
                    ...(typeof params.agent.givenName === 'string') ? { givenName: params.agent.givenName } : {},
                    ...(typeof params.agent.name === 'string') ? { name: params.agent.name } : {},
                    ...(typeof formattedTelephone === 'string') ? { telephone: formattedTelephone } : {},
                    ...(typeof params.agent.url === 'string') ? { url: params.agent.url } : {}
                };
            }
        }

        await repos.transaction.updateAgent({
            typeOf: params.typeOf,
            id: params.id,
            agent: newAgent,
            ...(customer !== undefined) ? { object: { customer } } : undefined
        });

        return newAgent;
    };
}

/**
 * ひとつの取引のタスクをエクスポートする
 */
export function exportTasks<T extends factory.transactionType>(params: {
    project?: factory.project.IProject;
    /**
     * タスク実行日時バッファ
     */
    runsTasksAfterInSeconds?: number;
    status: factory.transactionStatusType;
    typeOf?: { $in: T[] };
}) {
    return async (repos: {
        project: ProjectRepo;
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.startExportTasks({
            project: params.project,
            typeOf: params.typeOf,
            status: params.status
        });
        if (transaction === null) {
            return;
        }

        let tasks: factory.task.ITask<factory.taskName>[] = [];

        // 失敗してもここでは戻さない(RUNNINGのまま待機)
        switch (transaction.typeOf) {
            case factory.transactionType.MoneyTransfer:
                tasks = await MoneyTransferTransactionService.exportTasksById({
                    id: transaction.id,
                    runsTasksAfterInSeconds: params.runsTasksAfterInSeconds
                })(repos);
                break;

            case factory.transactionType.PlaceOrder:
                tasks = await PlaceOrderTransactionService.exportTasksById({
                    id: transaction.id,
                    runsTasksAfterInSeconds: params.runsTasksAfterInSeconds
                })(repos);
                break;

            case factory.transactionType.ReturnOrder:
                tasks = await ReturnOrderTransactionService.exportTasksById({
                    id: transaction.id,
                    runsTasksAfterInSeconds: params.runsTasksAfterInSeconds
                })(repos);
                break;

            default:
        }

        await repos.transaction.setTasksExportedById({ id: transaction.id });

        return tasks;
    };
}
