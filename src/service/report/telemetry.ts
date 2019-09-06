/**
 * データ測定サービス
 * 実験的実装中
 */
import * as repository from '../../repository';

import * as createDebug from 'debug';
import * as moment from 'moment';

import * as factory from '../../factory';

export type TelemetryOperation<T> =
    (repos: { telemetry: repository.Telemetry }) => Promise<T>;
export type TaskOperation<T> =
    (repos: { task: repository.Task }) => Promise<T>;
export type TransactionOperation<T> =
    (repos: { transaction: repository.Transaction }) => Promise<T>;
export type TaskAndTransactionOperation<T> =
    (repos: {
        task: repository.Task;
        transaction: repository.Transaction;
    }) => Promise<T>;
export type TaskAndTransactionAndActionOperation<T> =
    (repos: {
        task: repository.Task;
        transaction: repository.Transaction;
        action: repository.Action;
    }) => Promise<T>;
export type TransactionAndActionOperation<T> =
    (repos: {
        transaction: repository.Transaction;
        action: repository.Action;
    }) => Promise<T>;
export type TaskAndTelemetryAndTransactionOperation<T> = (repos: {
    task: repository.Task;
    telemetry: repository.Telemetry;
    transaction: repository.Transaction;
    action: repository.Action;
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
 * @export
 * @see https://en.wikipedia.org/wiki/Stock_and_flow
 */
export interface IGlobalFlowResult {
    tasks: IGlobalFlowTaskResultByName[];
    measuredFrom: Date;
    measuredThrough: Date;
}

/**
 * ストックデータ
 * @export
 * @see https://en.wikipedia.org/wiki/Stock_and_flow
 */
export interface IGlobalStockResult {
    tasks: {
        numberOfUnexecuted: number;
    };
    measuredAt: Date;
}

/**
 * 販売者が対象のフローデータ
 * @export
 */
export interface ISellerFlowResult {
    transactions: {
        /**
         * 集計期間中に開始された取引数
         */
        numberOfStarted: number;
        /**
         * 集計期間中に開始されてその後成立した取引数
         */
        numberOfStartedAndConfirmed: number;
        /**
         * 集計期間中に開始されてその後期限切れになった取引数
         */
        numberOfStartedAndExpired: number;
        /**
         * 集計期間中に成立した取引数
         */
        numberOfConfirmed: number;
        /**
         * 集計期間中に期限切れになった取引数
         */
        numberOfExpired: number;
        /**
         * クレジットカード決済数
         */
        numberOfPaymentCreditCard: number;
        /**
         * ムビチケ割引数
         */
        numberOfDiscountMvtk: number;
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
         * 取引の合計金額(yen)
         */
        totalAmount: number;
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
         * 注文アイテム数合計値
         */
        totalNumberOfOrderItems: number;
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
    measuredFrom: Date;
    measuredThrough: Date;
}

/**
 * 販売者が対象のストックデータ
 * @export
 */
export interface ISellerStockResult {
    transactions: {
        numberOfUnderway: number;
    };
    measuredAt: Date;
}

export enum TelemetryScope {
    Global = 'Global',
    Seller = 'Seller'
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

export interface IGlobalStockTelemetry extends ITelemetry {
    object: IGlobalObect;
    result: IGlobalStockResult;
}

export interface IGlobalFlowTelemetry extends ITelemetry {
    object: IGlobalObect;
    result: IGlobalFlowResult;
}

export interface ISellerStockTelemetry extends ITelemetry {
    object: ISellerObect;
    result: ISellerStockResult;
}

export interface ISellerFlowTelemetry extends ITelemetry {
    object: ISellerObect;
    result: ISellerFlowResult;
}

export function searchGlobalFlow(searchConditions: {
    measuredFrom: Date;
    measuredThrough: Date;
}): TelemetryOperation<IGlobalFlowTelemetry[]> {
    return search({ ...searchConditions, ...{ scope: TelemetryScope.Global, purpose: TelemetryPurposeType.Flow } });
}
export function searchGlobalStock(searchConditions: {
    measuredFrom: Date;
    measuredThrough: Date;
}): TelemetryOperation<IGlobalStockTelemetry[]> {
    return search({ ...searchConditions, ...{ scope: TelemetryScope.Global, purpose: TelemetryPurposeType.Stock } });
}
export function searchSellerFlow(searchConditions: {
    measuredFrom: Date;
    measuredThrough: Date;
}): TelemetryOperation<ISellerFlowTelemetry[]> {
    return search({ ...searchConditions, ...{ scope: TelemetryScope.Seller, purpose: TelemetryPurposeType.Flow } });
}
export function searchSellerStock(searchConditions: {
    measuredFrom: Date;
    measuredThrough: Date;
}): TelemetryOperation<ISellerStockTelemetry[]> {
    return search({ ...searchConditions, ...{ scope: TelemetryScope.Seller, purpose: TelemetryPurposeType.Stock } });
}

/**
 * 計測データを検索する
 * @export
 * @param searchConditions.measuredFrom 計測日時from
 * @param searchConditions.measuredThrough 計測日時through
 */
export function search(searchConditions: {
    measuredFrom: Date;
    measuredThrough: Date;
    scope: TelemetryScope;
    purpose: TelemetryPurposeType;
}) {
    return async (repos: { telemetry: repository.Telemetry }) => {
        return <ITelemetry[]>await repos.telemetry.telemetryModel.find(
            {
                'object.scope': {
                    $exists: true,
                    $eq: searchConditions.scope
                },
                'object.measuredAt': {
                    $exists: true,
                    $gte: searchConditions.measuredFrom,
                    $lt: searchConditions.measuredThrough
                },
                'purpose.typeOf': {
                    $exists: true,
                    $eq: searchConditions.purpose
                }
            }
        )
            .sort({ 'object.measuredAt': 1 })
            .lean()
            .exec();
    };
}

/**
 * フロー測定データを作成する
 * @export
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
export function createFlow(target: {
    measuredAt: Date;
    sellerId?: string;
}): TaskAndTelemetryAndTransactionOperation<void> {
    return async (repos: {
        task: repository.Task;
        telemetry: repository.Telemetry;
        transaction: repository.Transaction;
        action: repository.Action;
    }) => {
        const startDate = new Date();
        const measuredThrough = moment(target.measuredAt);
        const measuredFrom = moment(measuredThrough)
            .add(-TELEMETRY_UNIT_OF_MEASUREMENT_IN_SECONDS, 'seconds');

        let telemetry: IGlobalFlowTelemetry | ISellerFlowTelemetry;
        if (target.sellerId !== undefined) {
            const flowData = await createSellerFlow(measuredFrom.toDate(), measuredThrough.toDate(), target.sellerId)({
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
            const flowData = await createGlobalFlow(measuredFrom.toDate(), measuredThrough.toDate())({
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
 * ストック測定データを作成する
 * @export
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
export function createStock(target: {
    measuredAt: Date;
    sellerId?: string;
}): TaskAndTelemetryAndTransactionOperation<void> {
    return async (repos: {
        task: repository.Task;
        telemetry: repository.Telemetry;
        transaction: repository.Transaction;
    }) => {
        const startDate = new Date();

        let telemetry: IGlobalStockTelemetry | ISellerStockTelemetry;
        if (target.sellerId !== undefined) {
            const stockData = await createSellerStock(target.measuredAt, target.sellerId)({
                transaction: repos.transaction
            });
            debug('stockData created.');

            telemetry = {
                purpose: { typeOf: TelemetryPurposeType.Stock },
                object: {
                    scope: TelemetryScope.Seller,
                    measuredAt: target.measuredAt,
                    sellerId: target.sellerId
                },
                result: stockData,
                startDate: startDate,
                endDate: new Date()
            };
        } else {
            const stockData = await createGlobalStock(target.measuredAt)({ task: repos.task });
            debug('stockData created.');

            telemetry = {
                purpose: { typeOf: TelemetryPurposeType.Stock },
                object: {
                    scope: TelemetryScope.Global,
                    measuredAt: target.measuredAt
                },
                result: stockData,
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
 * @export
 * @param measuredFrom 計測開始日時
 * @param measuredThrough 計測終了日時
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
function createSellerFlow(
    measuredFrom: Date,
    measuredThrough: Date,
    sellerId: string
): TransactionAndActionOperation<ISellerFlowResult> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        transaction: repository.Transaction;
        action: repository.Action;
    }) => {
        // 計測期間内に開始された取引数を算出する
        const numberOfTransactionsStarted = await repos.transaction.transactionModel.count({
            typeOf: factory.transactionType.PlaceOrder,
            'seller.id': {
                $exists: true,
                $eq: sellerId
            },
            startDate: {
                $gte: measuredFrom,
                $lt: measuredThrough
            }
        })
            .exec();

        // 計測期間内に開始され、かつ、すでに終了している取引を検索
        const startedAndEndedTransactions = await repos.transaction.transactionModel.find({
            typeOf: factory.transactionType.PlaceOrder,
            'seller.id': {
                $exists: true,
                $eq: sellerId
            },
            startDate: {
                $gte: measuredFrom,
                $lt: measuredThrough
            },
            endDate: { $exists: true }
        })
            .exec()
            .then((docs) => docs.map((doc) => <factory.transaction.placeOrder.ITransaction>doc.toObject()));

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
                    $gte: measuredFrom,
                    $lt: measuredThrough
                }
            },
            'status startDate endDate object result.order'
        )
            .exec()
            .then((docs) => docs.map((doc) => <factory.transaction.placeOrder.ITransaction>doc.toObject()));
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
            (transaction) => moment(transaction.endDate)
                .diff(moment(transaction.startDate, 'milliseconds'))
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
            const seatReservation = <factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier.COA>>
                transaction.object.authorizeActions.find(
                    (action) => action.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation
                );

            return moment((<factory.event.screeningEvent.IEvent>seatReservation.object.event).startDate)
                .diff(moment(transaction.endDate), 'milliseconds');
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
        )
            .exec()
            .then((docs) => docs.map((doc) => <IAuthorizeAction>doc.toObject()));
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
            measuredFrom: measuredFrom,
            measuredThrough: measuredThrough
        };
    };
}

/**
 * ストック計測データを作成する
 * @export
 * @param measuredAt 計測日時
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
function createSellerStock(measuredAt: Date, sellerId: string): TransactionOperation<ISellerStockResult> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        transaction: repository.Transaction;
    }) => {
        const numberOfTransactionsUnderway = await repos.transaction.transactionModel.count({
            $or: [
                // {measuredAt}以前に開始し、{measuredAt}以後に成立あるいは期限切れした取引
                {
                    typeOf: factory.transactionType.PlaceOrder,
                    'seller.id': {
                        $exists: true,
                        $eq: sellerId
                    },
                    startDate: {
                        $lte: measuredAt
                    },
                    endDate: {
                        $exists: true,
                        $gt: measuredAt
                    }
                },
                // {measuredAt}以前に開始し、いまだに進行中の取引
                {
                    typeOf: factory.transactionType.PlaceOrder,
                    'seller.id': {
                        $exists: true,
                        $eq: sellerId
                    },
                    status: factory.transactionStatusType.InProgress,
                    startDate: {
                        $lte: measuredAt
                    }
                }
            ]
        })
            .exec();
        debug('numberOfTransactionsUnderway:', numberOfTransactionsUnderway);

        return {
            transactions: {
                numberOfUnderway: numberOfTransactionsUnderway
            },
            measuredAt: measuredAt
        };
    };
}

/**
 * フロー計測データーを作成する
 * @export
 * @param measuredFrom 計測開始日時
 * @param measuredThrough 計測終了日時
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
function createGlobalFlow(
    measuredFrom: Date,
    measuredThrough: Date
): TaskOperation<IGlobalFlowResult> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        task: repository.Task;
    }) => {
        // 全タスク名リスト
        const targetTaskNames: any[] = Object.keys(factory.taskName)
            .map((k) => (<any>factory.taskName)[k]);

        const taskResults = await Promise.all(targetTaskNames.map(async (taskName) => {
            const numberOfTasksCreated = await repos.task.taskModel.count({
                name: taskName,
                createdAt: {
                    $gte: measuredFrom,
                    $lt: measuredThrough
                }
            })
                .exec();
            debug('numberOfTasksCreated:', numberOfTasksCreated);

            // 実行中止ステータスで、最終試行日時が範囲にあるものを実行タスク数とする
            const numberOfTasksAborted = await repos.task.taskModel.count({
                name: taskName,
                lastTriedAt: {
                    $type: 'date',
                    $gte: measuredFrom,
                    $lt: measuredThrough
                },
                status: factory.taskStatus.Aborted
            })
                .exec();
            debug('numberOfTasksAborted:', numberOfTasksAborted);

            // 実行済みステータスで、最終試行日時が範囲にあるものを実行タスク数とする
            const executedTasks = await repos.task.taskModel.find(
                {
                    name: taskName,
                    lastTriedAt: {
                        $type: 'date',
                        $gte: measuredFrom,
                        $lt: measuredThrough
                    },
                    status: factory.taskStatus.Executed
                },
                'runsAt lastTriedAt numberOfTried'
            )
                .exec()
                .then((docs) => docs.map((doc) => <factory.task.ITask<factory.taskName>>doc.toObject()));
            debug(executedTasks.length, 'executedTasks found.');

            const numberOfTasksExecuted = executedTasks.length;

            const latencies = executedTasks.map((task) => moment(<Date>task.lastTriedAt)
                .diff(moment(task.runsAt, 'milliseconds')));
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
            measuredFrom: measuredFrom,
            measuredThrough: measuredThrough
        };
    };
}

/**
 * ストック計測データを作成する
 * @export
 * @param measuredAt 計測日時
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
function createGlobalStock(measuredAt: Date): TaskOperation<IGlobalStockResult> {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        task: repository.Task;
    }) => {
        // 待機状態のタスク数を算出
        debug('counting waiting tasks globally...');
        const numberOfTasksUnexecuted = await repos.task.taskModel.count({
            runsAt: { $lt: measuredAt }, // 実行日時を超過している
            status: { $in: [factory.taskStatus.Ready, factory.taskStatus.Running] }
        })
            .exec();
        debug('global waiting tasks count', numberOfTasksUnexecuted);

        return {
            tasks: {
                numberOfUnexecuted: numberOfTasksUnexecuted
            },
            measuredAt: measuredAt
        };
    };
}
