/**
 * データ測定サービス
 * 実験的実装中
 */
import * as createDebug from 'debug';
import * as moment from 'moment';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TelemetryRepo } from '../../repo/telemetry';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

export type TelemetryOperation<T> =
    (repos: { telemetry: TelemetryRepo }) => Promise<T>;
export type TaskOperation<T> =
    (repos: { task: TaskRepo }) => Promise<T>;
export type TransactionOperation<T> =
    (repos: { transaction: TransactionRepo }) => Promise<T>;
export type TaskAndTransactionOperation<T> =
    (repos: {
        task: TaskRepo;
        transaction: TransactionRepo;
    }) => Promise<T>;
export type TaskAndTransactionAndActionOperation<T> =
    (repos: {
        task: TaskRepo;
        transaction: TransactionRepo;
        action: ActionRepo;
    }) => Promise<T>;
export type TransactionAndActionOperation<T> =
    (repos: {
        transaction: TransactionRepo;
        action: ActionRepo;
    }) => Promise<T>;
export type TaskAndTelemetryAndTransactionOperation<T> = (repos: {
    task: TaskRepo;
    telemetry: TelemetryRepo;
    transaction: TransactionRepo;
    action: ActionRepo;
}) => Promise<T>;

const debug = createDebug('cinerino-domain:service');
const TELEMETRY_UNIT_OF_MEASUREMENT_IN_SECONDS = 60; // 測定単位時間(秒)

export interface IGlobalFlowTaskResultByName {
    name: factory.taskName;
    /**
     * 集計期間中に作成されたタスク数
     */
    numberOfCreated: number;
    /**
     * 集計期間中に実行されたタスク数
     */
    numberOfExecuted: number;
    /**
     * 集計期間中に中止されたタスク数
     */
    numberOfAborted: number;
    /**
     * 合計待ち時間
     */
    totalLatencyInMilliseconds: number;
    /**
     * 最大待ち時間
     */
    maxLatencyInMilliseconds: number;
    /**
     * 最小待ち時間
     */
    minLatencyInMilliseconds: number;
    /**
     * 合計試行回数
     */
    totalNumberOfTrials: number;
    /**
     * 最大試行回数
     */
    maxNumberOfTrials: number;
    /**
     * 最小試行回数
     */
    minNumberOfTrials: number;
}

/**
 * フローデータ
 * @see https://en.wikipedia.org/wiki/Stock_and_flow
 */
export interface IGlobalFlowResult {
    tasks: IGlobalFlowTaskResultByName[];
    transactions?: {
        /**
         * 集計期間中に開始されてその後成立した取引数
         */
        numberOfStartedAndConfirmed: number;
        /**
         * 集計期間中に開始されてその後期限切れになった取引数
         */
        numberOfStartedAndExpired: number;
        /**
         * 取引の合計所要時間(ミリ秒)
         */
        totalRequiredTimeInMilliseconds: number;
        /**
         * 取引の最大所要時間(ミリ秒)
         */
        maxRequiredTimeInMilliseconds: number;
        /**
         * 取引の最小所要時間(ミリ秒)
         */
        minRequiredTimeInMilliseconds: number;
        /**
         * 取引の平均所要時間(ミリ秒)
         */
        averageRequiredTimeInMilliseconds: number;
        /**
         * イベントまでの合計残り時間(ミリ秒)
         */
        totalTimeLeftUntilEventInMilliseconds: number;
        /**
         * イベントまでの最大残り時間(ミリ秒)
         */
        maxTimeLeftUntilEventInMilliseconds: number;
        /**
         * イベントまでの最小残り時間(ミリ秒)
         */
        minTimeLeftUntilEventInMilliseconds: number;
        /**
         * イベントまでの平均残り時間(ミリ秒)
         */
        averageTimeLeftUntilEventInMilliseconds: number;
        /**
         * 最大金額
         */
        maxAmount: number;
        /**
         * 最小金額
         */
        minAmount: number;
        /**
         * 平均金額
         */
        averageAmount: number;
        /**
         * アクション数合計値(成立取引)
         */
        totalNumberOfActionsOnConfirmed: number;
        /**
         * 最大アクション数(成立取引)
         */
        maxNumberOfActionsOnConfirmed: number;
        /**
         * 最小アクション数(成立取引)
         */
        minNumberOfActionsOnConfirmed: number;
        /**
         * 平均アクション数(成立取引)
         */
        averageNumberOfActionsOnConfirmed: number;
        /**
         * アクション数合計値(期限切れ取引)
         */
        totalNumberOfActionsOnExpired: number;
        /**
         * 最大アクション数(期限切れ取引)
         */
        maxNumberOfActionsOnExpired: number;
        /**
         * 最小アクション数(期限切れ取引)
         */
        minNumberOfActionsOnExpired: number;
        /**
         * 平均アクション数(期限切れ取引)
         */
        averageNumberOfActionsOnExpired: number;
        /**
         * 最大注文アイテム数
         */
        maxNumberOfOrderItems: number;
        /**
         * 最小注文アイテム数
         */
        minNumberOfOrderItems: number;
        /**
         * 平均注文アイテム数
         */
        averageNumberOfOrderItems: number;
    };
    measureFrom: Date;
    measureThrough: Date;
}

/**
 * 販売者が対象のフローデータ
 */
export interface ISellerFlowResult {
    transactions: {
        /**
         * 集計期間中に開始されてその後成立した取引数
         */
        numberOfStartedAndConfirmed: number;
        /**
         * 集計期間中に開始されてその後期限切れになった取引数
         */
        numberOfStartedAndExpired: number;
        /**
         * 取引の合計所要時間(ミリ秒)
         */
        totalRequiredTimeInMilliseconds: number;
        /**
         * 取引の最大所要時間(ミリ秒)
         */
        maxRequiredTimeInMilliseconds: number;
        /**
         * 取引の最小所要時間(ミリ秒)
         */
        minRequiredTimeInMilliseconds: number;
        /**
         * 取引の平均所要時間(ミリ秒)
         */
        averageRequiredTimeInMilliseconds: number;
        /**
         * イベントまでの合計残り時間(ミリ秒)
         */
        totalTimeLeftUntilEventInMilliseconds: number;
        /**
         * イベントまでの最大残り時間(ミリ秒)
         */
        maxTimeLeftUntilEventInMilliseconds: number;
        /**
         * イベントまでの最小残り時間(ミリ秒)
         */
        minTimeLeftUntilEventInMilliseconds: number;
        /**
         * イベントまでの平均残り時間(ミリ秒)
         */
        averageTimeLeftUntilEventInMilliseconds: number;
        /**
         * 最大金額
         */
        maxAmount: number;
        /**
         * 最小金額
         */
        minAmount: number;
        /**
         * 平均金額
         */
        averageAmount: number;
        /**
         * アクション数合計値(成立取引)
         */
        totalNumberOfActionsOnConfirmed: number;
        /**
         * 最大アクション数(成立取引)
         */
        maxNumberOfActionsOnConfirmed: number;
        /**
         * 最小アクション数(成立取引)
         */
        minNumberOfActionsOnConfirmed: number;
        /**
         * 平均アクション数(成立取引)
         */
        averageNumberOfActionsOnConfirmed: number;
        /**
         * アクション数合計値(期限切れ取引)
         */
        totalNumberOfActionsOnExpired: number;
        /**
         * 最大アクション数(期限切れ取引)
         */
        maxNumberOfActionsOnExpired: number;
        /**
         * 最小アクション数(期限切れ取引)
         */
        minNumberOfActionsOnExpired: number;
        /**
         * 平均アクション数(期限切れ取引)
         */
        averageNumberOfActionsOnExpired: number;
        /**
         * 最大注文アイテム数
         */
        maxNumberOfOrderItems: number;
        /**
         * 最小注文アイテム数
         */
        minNumberOfOrderItems: number;
        /**
         * 平均注文アイテム数
         */
        averageNumberOfOrderItems: number;
    };
    measureFrom: Date;
    measureThrough: Date;
}
export enum TelemetryScope {
    Global = 'Global',
    Seller = 'Seller'
}
export enum TelemetryType {
    SalesAmount = 'SalesAmount',
    SalesAmountByClient = 'SalesAmountByClient',
    SalesAmountByPaymentMethod = 'SalesAmountByPaymentMethod',
    NumOrderItems = 'NumOrderItems',
    NumOrderItemsByClient = 'NumOrderItemsByClient',
    NumOrderItemsByPaymentMethod = 'NumOrderItemsByPaymentMethod',
    NumPlaceOrderStarted = 'NumPlaceOrderStarted',
    NumPlaceOrderCanceled = 'NumPlaceOrderCanceled',
    NumPlaceOrderConfirmed = 'NumPlaceOrderConfirmed',
    NumPlaceOrderExpired = 'NumPlaceOrderExpired'
}
export enum TelemetryPurposeType {
    Flow = 'Flow',
    Stock = 'Stock'
}
export interface IGlobalObect {
    scope: TelemetryScope;
    measuredAt: Date;
}
export interface ISellerObect {
    scope: TelemetryScope;
    measuredAt: Date;
    sellerId: string;
}
/**
 * 測定データインターフェース
 */
export interface ITelemetry {
    object: any;
    result: any;
    startDate: Date;
    endDate: Date;
    purpose: {
        typeOf: TelemetryPurposeType;
    };
}
export interface IGlobalFlowTelemetry extends ITelemetry {
    object: IGlobalObect;
    result: IGlobalFlowResult;
}
export interface ISellerFlowTelemetry extends ITelemetry {
    object: ISellerObect;
    result: ISellerFlowResult;
}
/**
 * フロー測定データを作成する
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
export function createFlow(target: {
    measuredAt: Date;
    sellerId?: string;
}): TaskAndTelemetryAndTransactionOperation<void> {
    return async (repos: {
        task: TaskRepo;
        telemetry: TelemetryRepo;
        transaction: TransactionRepo;
        action: ActionRepo;
    }) => {
        const startDate = new Date();
        const measureThrough = moment(target.measuredAt);
        const measureFrom = moment(measureThrough).add(-TELEMETRY_UNIT_OF_MEASUREMENT_IN_SECONDS, 'seconds');

        let telemetry: IGlobalFlowTelemetry | ISellerFlowTelemetry;
        if (target.sellerId !== undefined) {
            const flowData = await createSellerFlow(measureFrom.toDate(), measureThrough.toDate(), target.sellerId)({
                transaction: repos.transaction,
                action: repos.action
            });
            debug('flowData created.');

            telemetry = {
                purpose: { typeOf: TelemetryPurposeType.Flow },
                object: {
                    scope: TelemetryScope.Seller,
                    measuredAt: target.measuredAt,
                    sellerId: target.sellerId
                },
                result: flowData,
                startDate: startDate,
                endDate: new Date()
            };
        } else {
            const flowData = await createGlobalFlow(measureFrom.toDate(), measureThrough.toDate())({
                task: repos.task
            });
            debug('flowData created.');

            telemetry = {
                purpose: { typeOf: TelemetryPurposeType.Flow },
                object: {
                    scope: TelemetryScope.Global,
                    measuredAt: target.measuredAt
                },
                result: flowData,
                startDate: startDate,
                endDate: new Date()
            };
        }

        await repos.telemetry.telemetryModel.create(telemetry);
        debug('telemetry saved.');
    };
}
/**
 * フロー計測データーを作成する
 * @param measureFrom 計測開始日時
 * @param measureThrough 計測終了日時
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
function createSellerFlow(
    measureFrom: Date,
    measureThrough: Date,
    sellerId: string
): TransactionAndActionOperation<ISellerFlowResult> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        transaction: TransactionRepo;
        action: ActionRepo;
    }) => {
        // 計測期間内に開始された取引数を算出する
        const numberOfTransactionsStarted = await repos.transaction.transactionModel.count({
            typeOf: factory.transactionType.PlaceOrder,
            'seller.id': {
                $exists: true,
                $eq: sellerId
            },
            startDate: {
                $gte: measureFrom,
                $lt: measureThrough
            }
        }).exec();

        // 計測期間内に開始され、かつ、すでに終了している取引を検索
        const startedAndEndedTransactions = await repos.transaction.transactionModel.find({
            typeOf: factory.transactionType.PlaceOrder,
            'seller.id': {
                $exists: true,
                $eq: sellerId
            },
            startDate: {
                $gte: measureFrom,
                $lt: measureThrough
            },
            endDate: { $exists: true }
        }).exec().then((docs) => docs.map((doc) => <factory.transaction.placeOrder.ITransaction>doc.toObject()));

        const numberOfStartedAndConfirmed = startedAndEndedTransactions.filter(
            (transaction) => transaction.status === factory.transactionStatusType.Confirmed
        ).length;
        const numberOfStartedAndExpired = startedAndEndedTransactions.filter(
            (transaction) => transaction.status === factory.transactionStatusType.Expired
        ).length;

        const endedTransactions = await repos.transaction.transactionModel.find(
            {
                typeOf: factory.transactionType.PlaceOrder,
                'seller.id': {
                    $exists: true,
                    $eq: sellerId
                },
                endDate: {
                    $exists: true,
                    $gte: measureFrom,
                    $lt: measureThrough
                }
            },
            'status startDate endDate object result.order'
        ).exec().then((docs) => docs.map((doc) => <factory.transaction.placeOrder.ITransaction>doc.toObject()));
        debug(endedTransactions.length, 'endedTransactions found.');

        const confirmedTransactions = endedTransactions.filter(
            (transaction) => transaction.status === factory.transactionStatusType.Confirmed
        );
        const expiredTransactions = endedTransactions.filter(
            (transaction) => transaction.status === factory.transactionStatusType.Expired
        );

        const numberOfTransactionsConfirmed = confirmedTransactions.length;

        // 所要時間算出(期間の成立取引リストを取得し、開始時刻と成立時刻の差を所要時間とする)
        const requiredTimesConfirmed = confirmedTransactions.map(
            (transaction) => moment(transaction.endDate).diff(moment(transaction.startDate, 'milliseconds'))
        );
        const totalRequiredTimeInMilliseconds = requiredTimesConfirmed.reduce((a, b) => a + b, 0);
        const maxRequiredTimeInMilliseconds = requiredTimesConfirmed.reduce((a, b) => Math.max(a, b), 0);
        const minRequiredTimeInMilliseconds =
            requiredTimesConfirmed.reduce((a, b) => Math.min(a, b), (numberOfTransactionsConfirmed > 0) ? requiredTimesConfirmed[0] : 0);
        const averageRequiredTimeInMilliseconds =
            (numberOfTransactionsConfirmed > 0) ? totalRequiredTimeInMilliseconds / numberOfTransactionsConfirmed : 0;

        // イベントまでの残り時間算出(イベント開始日時と成立日時の差)
        const timesLeftUntilEvent = confirmedTransactions.map((transaction) => {
            // 座席予約は必ず存在する
            const seatReservation = <factory.action.authorize.offer.seatReservation.IAction>transaction.object.authorizeActions.find(
                (action) => action.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation
            );
            const reserveTransaction = (<factory.action.authorize.offer.seatReservation.IResult>seatReservation.result).responseBody;

            return moment(reserveTransaction.object.event.startDate).diff(moment(transaction.endDate), 'milliseconds');
        });
        const totalTimeLeftUntilEventInMilliseconds = timesLeftUntilEvent.reduce((a, b) => a + b, 0);
        const maxTimeLeftUntilEventInMilliseconds = timesLeftUntilEvent.reduce((a, b) => Math.max(a, b), 0);
        const minTimeLeftUntilEventInMilliseconds =
            timesLeftUntilEvent.reduce((a, b) => Math.min(a, b), (numberOfTransactionsConfirmed > 0) ? timesLeftUntilEvent[0] : 0);
        const averageTimeLeftUntilEventInMilliseconds =
            (numberOfTransactionsConfirmed > 0) ? totalTimeLeftUntilEventInMilliseconds / numberOfTransactionsConfirmed : 0;

        // 金額算出
        const amounts = confirmedTransactions.map(
            (transaction) => (<factory.transaction.placeOrder.IResult>transaction.result).order.price
        );
        const totalAmount = amounts.reduce((a, b) => a + b, 0);
        const maxAmount = amounts.reduce((a, b) => Math.max(a, b), 0);
        const minAmount = amounts.reduce((a, b) => Math.min(a, b), (numberOfTransactionsConfirmed > 0) ? amounts[0] : 0);
        const averageAmount = (numberOfTransactionsConfirmed > 0) ? totalAmount / numberOfTransactionsConfirmed : 0;

        // アクション数集計
        const numbersOfActions = confirmedTransactions.map((t) => t.object.authorizeActions.length);
        const totalNumberOfActions = numbersOfActions.reduce((a, b) => a + b, 0);
        const maxNumberOfActions = numbersOfActions.reduce((a, b) => Math.max(a, b), 0);
        const minNumberOfActions = numbersOfActions.reduce(
            (a, b) => Math.min(a, b), (numberOfTransactionsConfirmed > 0) ? numbersOfActions[0] : 0
        );
        const averageNumberOfActions = (numberOfTransactionsConfirmed > 0) ? totalNumberOfActions / numberOfTransactionsConfirmed : 0;

        // 期限切れ取引数
        const numberOfTransactionsExpired = expiredTransactions.length;
        const expiredTransactionIds = expiredTransactions.map((transaction) => transaction.id);

        type IAuthorizeAction = factory.action.authorize.IAction<factory.action.authorize.IAttributes<any, any>>;

        // 期限切れ取引に対して作成されたアクションを取得
        const actionsOnExpiredTransactions = await repos.action.actionModel.find(
            {
                typeOf: factory.actionType.AuthorizeAction,
                'purpose.id': {
                    $exists: true,
                    $in: expiredTransactionIds
                }
            },
            '_id purpose.id'
        ).exec().then((docs) => docs.map((doc) => <IAuthorizeAction>doc.toObject()));
        debug(actionsOnExpiredTransactions.length, 'actionsOnExpiredTransactions found.');
        const numbersOfActionsOnExpired = expiredTransactionIds.map((transactionId) => {
            return actionsOnExpiredTransactions.filter((action) => action.purpose.id === transactionId).length;
        });
        const totalNumberOfActionsOnExpired = numbersOfActionsOnExpired.reduce((a, b) => a + b, 0);
        const maxNumberOfActionsOnExpired = numbersOfActionsOnExpired.reduce((a, b) => Math.max(a, b), 0);
        const minNumberOfActionsOnExpired = numbersOfActionsOnExpired.reduce(
            (a, b) => Math.min(a, b), (numberOfTransactionsExpired > 0) ? numbersOfActionsOnExpired[0] : 0
        );
        const averageNumberOfActionsOnExpired =
            (numberOfTransactionsExpired > 0) ? totalNumberOfActionsOnExpired / numberOfTransactionsExpired : 0;

        return {
            transactions: {
                numberOfStarted: numberOfTransactionsStarted,
                numberOfStartedAndConfirmed: numberOfStartedAndConfirmed,
                numberOfStartedAndExpired: numberOfStartedAndExpired,
                numberOfConfirmed: numberOfTransactionsConfirmed,
                numberOfExpired: numberOfTransactionsExpired,
                // tslint:disable-next-line:no-suspicious-comment
                numberOfPaymentCreditCard: 0, // TODO 実装
                // tslint:disable-next-line:no-suspicious-comment
                numberOfDiscountMvtk: 0, // TODO 実装
                totalRequiredTimeInMilliseconds: totalRequiredTimeInMilliseconds,
                maxRequiredTimeInMilliseconds: maxRequiredTimeInMilliseconds,
                minRequiredTimeInMilliseconds: minRequiredTimeInMilliseconds,
                averageRequiredTimeInMilliseconds: parseFloat(averageRequiredTimeInMilliseconds.toFixed(1)),
                totalTimeLeftUntilEventInMilliseconds: totalTimeLeftUntilEventInMilliseconds,
                maxTimeLeftUntilEventInMilliseconds: maxTimeLeftUntilEventInMilliseconds,
                minTimeLeftUntilEventInMilliseconds: minTimeLeftUntilEventInMilliseconds,
                averageTimeLeftUntilEventInMilliseconds: averageTimeLeftUntilEventInMilliseconds,
                totalAmount: totalAmount,
                maxAmount: maxAmount,
                minAmount: minAmount,
                averageAmount: parseFloat(averageAmount.toFixed(1)),
                totalNumberOfActionsOnConfirmed: totalNumberOfActions,
                maxNumberOfActionsOnConfirmed: maxNumberOfActions,
                minNumberOfActionsOnConfirmed: minNumberOfActions,
                averageNumberOfActionsOnConfirmed: parseFloat(averageNumberOfActions.toFixed(1)),
                totalNumberOfActionsOnExpired: totalNumberOfActionsOnExpired,
                maxNumberOfActionsOnExpired: maxNumberOfActionsOnExpired,
                minNumberOfActionsOnExpired: minNumberOfActionsOnExpired,
                averageNumberOfActionsOnExpired: parseFloat(averageNumberOfActionsOnExpired.toFixed(1)),
                // tslint:disable-next-line:no-suspicious-comment
                totalNumberOfOrderItems: 0, // TODO 実装
                // tslint:disable-next-line:no-suspicious-comment
                maxNumberOfOrderItems: 0, // TODO 実装
                // tslint:disable-next-line:no-suspicious-comment
                minNumberOfOrderItems: 0, // TODO 実装
                // tslint:disable-next-line:no-suspicious-comment
                averageNumberOfOrderItems: 0 // TODO 実装
            },
            measureFrom: measureFrom,
            measureThrough: measureThrough
        };
    };
}
/**
 * フロー計測データーを作成する
 * @param measureFrom 計測開始日時
 * @param measureThrough 計測終了日時
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
function createGlobalFlow(
    measureFrom: Date,
    measureThrough: Date
): TaskOperation<IGlobalFlowResult> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        task: TaskRepo;
    }) => {
        // 全タスク名リスト
        const targetTaskNames: any[] = Object.keys(factory.taskName).map((k) => factory.taskName[<any>k]);

        const taskResults = await Promise.all(targetTaskNames.map(async (taskName) => {
            const numberOfTasksCreated = await repos.task.taskModel.count({
                name: taskName,
                createdAt: {
                    $gte: measureFrom,
                    $lt: measureThrough
                }
            }).exec();
            debug('numberOfTasksCreated:', numberOfTasksCreated);

            // 実行中止ステータスで、最終試行日時が範囲にあるものを実行タスク数とする
            const numberOfTasksAborted = await repos.task.taskModel.count({
                name: taskName,
                lastTriedAt: {
                    $type: 'date',
                    $gte: measureFrom,
                    $lt: measureThrough
                },
                status: factory.taskStatus.Aborted
            }).exec();
            debug('numberOfTasksAborted:', numberOfTasksAborted);

            // 実行済みステータスで、最終試行日時が範囲にあるものを実行タスク数とする
            const executedTasks = await repos.task.taskModel.find(
                {
                    name: taskName,
                    lastTriedAt: {
                        $type: 'date',
                        $gte: measureFrom,
                        $lt: measureThrough
                    },
                    status: factory.taskStatus.Executed
                },
                'runsAt lastTriedAt numberOfTried'
            ).exec().then((docs) => docs.map((doc) => <factory.task.ITask<any>>doc.toObject()));
            debug(executedTasks.length, 'executedTasks found.');

            const numberOfTasksExecuted = executedTasks.length;

            const latencies = executedTasks.map((task) => moment(<Date>task.lastTriedAt).diff(moment(task.runsAt, 'milliseconds')));
            const totalLatency = latencies.reduce((a, b) => a + b, 0);
            const maxLatency = latencies.reduce((a, b) => Math.max(a, b), 0);
            const minLatency = latencies.reduce((a, b) => Math.min(a, b), (numberOfTasksExecuted > 0) ? latencies[0] : 0);

            const numbersOfTrials = await Promise.all(executedTasks.map((task) => task.numberOfTried));
            const totalNumberOfTrials = numbersOfTrials.reduce((a, b) => a + b, 0);
            const maxNumberOfTrials = numbersOfTrials.reduce((a, b) => Math.max(a, b), 0);
            const minNumberOfTrials = numbersOfTrials.reduce(
                (a, b) => Math.min(a, b), (numberOfTasksExecuted > 0) ? numbersOfTrials[0] : 0
            );

            return {
                name: taskName,
                numberOfCreated: numberOfTasksCreated,
                numberOfExecuted: numberOfTasksExecuted,
                numberOfAborted: numberOfTasksAborted,
                totalLatencyInMilliseconds: totalLatency,
                maxLatencyInMilliseconds: maxLatency,
                minLatencyInMilliseconds: minLatency,
                totalNumberOfTrials: totalNumberOfTrials,
                maxNumberOfTrials: maxNumberOfTrials,
                minNumberOfTrials: minNumberOfTrials
            };
        }));

        return {
            tasks: taskResults,
            measureFrom: measureFrom,
            measureThrough: measureThrough
        };
    };
}

/**
 * 注文取引集計
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
export function aggregatePlaceOrder(params: {
    measureFrom: Date;
    measureThrough: Date;
}) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        telemetry: TelemetryRepo;
        transaction: TransactionRepo;
    }) => {
        const numPlaceOrderStarted = await repos.transaction.count<factory.transactionType.PlaceOrder>({
            typeOf: factory.transactionType.PlaceOrder,
            startFrom: params.measureFrom,
            startThrough: params.measureThrough
        });
        const endedTransactions = await repos.transaction.search<factory.transactionType.PlaceOrder>({
            typeOf: factory.transactionType.PlaceOrder,
            endFrom: params.measureFrom,
            endThrough: params.measureThrough
        });
        debug(endedTransactions.length, 'endedTransactions found');
        const confirmedTransactions = endedTransactions.filter((t) => t.status === factory.transactionStatusType.Confirmed);
        const numPlaceOrderExpired = endedTransactions.filter((t) => t.status === factory.transactionStatusType.Expired).length;
        const numPlaceOrderCanceled = endedTransactions.filter((t) => t.status === factory.transactionStatusType.Canceled).length;
        const numPlaceOrderConfirmed = confirmedTransactions.length;

        // 金額集計
        const totalSalesAmount = confirmedTransactions.map((t) => (<factory.transaction.placeOrder.IResult>t.result).order.price)
            .reduce((a, b) => a + b, 0);
        // 注文アイテム数
        const numOrderItems = confirmedTransactions
            .map((t) => (<factory.transaction.placeOrder.IResult>t.result).order.acceptedOffers.length)
            .reduce((a, b) => a + b, 0);

        const salesAmountByClient: ITelemetryValueAsObject = {};
        const salesAmountByPaymentMethod: ITelemetryValueAsObject = {};
        const numOrderItemsByClient: ITelemetryValueAsObject = {};
        const numOrderItemsByPaymentMethod: ITelemetryValueAsObject = {};
        confirmedTransactions.forEach((t) => {
            const order = (<factory.transaction.placeOrder.IResult>t.result).order;
            const amount = order.price;
            const numItems = order.acceptedOffers.length;

            // クライアントごとの集計
            const clientUser = t.object.clientUser;
            if (clientUser !== undefined) {
                const clientId = clientUser.client_id;
                if (salesAmountByClient[clientId] === undefined) {
                    salesAmountByClient[clientId] = 0;
                }
                salesAmountByClient[clientId] += amount;

                if (numOrderItemsByClient[clientId] === undefined) {
                    numOrderItemsByClient[clientId] = 0;
                }
                numOrderItemsByClient[clientId] += numItems;
            }

            // 決済方法ごとの集計
            order.paymentMethods.forEach((paymentMethod) => {
                const paymentMethodType = paymentMethod.typeOf;
                if (salesAmountByPaymentMethod[paymentMethodType] === undefined) {
                    salesAmountByPaymentMethod[paymentMethodType] = 0;
                }
                salesAmountByPaymentMethod[paymentMethodType] += amount;

                if (numOrderItemsByPaymentMethod[paymentMethodType] === undefined) {
                    numOrderItemsByPaymentMethod[paymentMethodType] = 0;
                }
                numOrderItemsByPaymentMethod[paymentMethodType] += numItems;
            });
        });
        debug('salesAmountByClient:', salesAmountByClient);
        debug('salesAmountByPaymentMethod:', salesAmountByPaymentMethod);
        debug('numOrderItemsByClient:', numOrderItemsByClient);
        debug('numOrderItemsByPaymentMethod:', numOrderItemsByPaymentMethod);

        const savingTelemetries = [
            { typeOf: TelemetryType.SalesAmount, value: totalSalesAmount },
            { typeOf: TelemetryType.SalesAmountByClient, value: salesAmountByClient },
            { typeOf: TelemetryType.SalesAmountByPaymentMethod, value: salesAmountByPaymentMethod },
            { typeOf: TelemetryType.NumOrderItems, value: numOrderItems },
            { typeOf: TelemetryType.NumOrderItemsByClient, value: numOrderItemsByClient },
            { typeOf: TelemetryType.NumOrderItemsByPaymentMethod, value: numOrderItemsByPaymentMethod },
            { typeOf: TelemetryType.NumPlaceOrderCanceled, value: numPlaceOrderCanceled },
            { typeOf: TelemetryType.NumPlaceOrderConfirmed, value: numPlaceOrderConfirmed },
            { typeOf: TelemetryType.NumPlaceOrderExpired, value: numPlaceOrderExpired },
            { typeOf: TelemetryType.NumPlaceOrderStarted, value: numPlaceOrderStarted }
        ];
        await Promise.all(savingTelemetries.map(async (telemetry) => {
            await saveTelemetry({
                telemetryType: telemetry.typeOf,
                measureFrom: params.measureFrom,
                measureThrough: params.measureThrough,
                value: telemetry.value
            })(repos);
        }));
    };
}
export interface ITelemetryValueAsObject { [key: string]: number; }
export type ITelemetryValue = number | ITelemetryValueAsObject;
function saveTelemetry(params: {
    telemetryType: TelemetryType;
    measureFrom: Date;
    measureThrough: Date;
    value: ITelemetryValue;
}) {
    return async (repos: { telemetry: TelemetryRepo }) => {
        const telemetryMeasureDate = moment(moment(params.measureFrom).format('YYYY-MM-DDT00:00:00Z')).toDate();
        const initialValue = (typeof params.value === 'number') ? 0 : {};
        const setOnInsert: any = {
            'result.numSamples': 0,
            'result.totalSamples': initialValue
        };
        // tslint:disable-next-line:no-magic-numbers
        for (let i = 0; i < 24; i += 1) {
            setOnInsert[`result.values.${i}.numSamples`] = 0;
            setOnInsert[`result.values.${i}.totalSamples`] = initialValue;
            // tslint:disable-next-line:no-magic-numbers
            for (let j = 0; j < 60; j += 1) {
                setOnInsert[`result.values.${i}.values.${j}`] = initialValue;
            }
        }

        const hour = moment(params.measureFrom).format('H');
        const min = moment(params.measureFrom).format('m');
        const inc = {
            [`result.values.${hour}.numSamples`]: 1,
            'result.numSamples': 1
        };
        if (typeof params.value === 'number') {
            inc[`result.values.${hour}.totalSamples`] = params.value;
            inc['result.totalSamples'] = params.value;
        } else {
            const valueAsObject = params.value;
            Object.keys(valueAsObject).forEach((key) => {
                inc[`result.values.${hour}.totalSamples.${key}`] = valueAsObject[key];
                inc[`result.totalSamples.${key}`] = valueAsObject[key];
            });
        }

        // 日データを初期化
        await repos.telemetry.telemetryModel.findOneAndUpdate(
            {
                'purpose.typeOf': params.telemetryType,
                'object.scope': TelemetryScope.Global,
                'object.measureDate': telemetryMeasureDate
            },
            { $setOnInsert: setOnInsert },
            { upsert: true, strict: false }
        ).exec();

        await repos.telemetry.telemetryModel.findOneAndUpdate(
            {
                'purpose.typeOf': params.telemetryType,
                'object.scope': TelemetryScope.Global,
                'object.measureDate': telemetryMeasureDate
            },
            {
                $set: {
                    [`result.values.${hour}.values.${min}`]: params.value
                },
                $inc: inc
            },
            { new: true }
        ).exec();
        debug('telemetry saved', params.telemetryType, params.measureFrom);
    };
}
export function search(params: {
    telemetryType: string;
    measureFrom: Date;
    measureThrough: Date;
    scope: TelemetryScope;
}) {
    return async (repos: {
        telemetry: TelemetryRepo;
    }) => {
        const measureFrom = moment(params.measureFrom);
        const measureThrough = moment(params.measureThrough);
        let resolution = '1day';
        if (measureThrough.diff(measureFrom, 'days') < 1) {
            resolution = '1min';
        } else if (measureThrough.diff(measureFrom, 'months') < 1) {
            resolution = '1hour';
        }

        const searchConditions = {
            measureFrom: moment(moment(measureFrom).format('YYYY-MM-DDT00:00:00Z')).toDate(),
            measureThrough: moment(moment(measureThrough).add(1, 'day').format('YYYY-MM-DDT00:00:00Z')).toDate()
        };
        const telemetries = await repos.telemetry.telemetryModel.find({
            $and: [
                { 'purpose.typeOf': params.telemetryType },
                { 'object.scope': params.scope },
                { 'object.measureDate': { $gte: searchConditions.measureFrom } },
                { 'object.measureDate': { $lt: searchConditions.measureThrough } }
            ]
        }).sort({ 'object.measureDate': 1 }).exec().then((docs) => docs.map((doc) => doc.toObject()));
        const datas: any[] = [];
        switch (resolution) {
            case '1hour':
                telemetries.forEach((telemetry) => {
                    Object.keys(telemetry.result.values).forEach((h) => {
                        datas.push({
                            measureDate: moment(telemetry.object.measureDate).add(Number(h), 'hours').toDate(),
                            value: telemetry.result.values[h].totalSamples
                        });
                    });
                });
                break;
            case '1min':
                telemetries.forEach((telemetry) => {
                    Object.keys(telemetry.result.values).forEach((h) => {
                        Object.keys(telemetry.result.values[h].values).forEach((m) => {
                            datas.push({
                                measureDate: moment(telemetry.object.measureDate)
                                    .add(Number(h), 'hours').add(Number(m), 'minutes').toDate(),
                                value: telemetry.result.values[h].values[m]
                            });
                        });
                    });
                });
                break;
            default:
                telemetries.forEach((telemetry) => {
                    datas.push({
                        measureDate: telemetry.object.measureDate,
                        value: telemetry.result.totalSamples
                    });
                });
        }

        return datas;
    };
}
