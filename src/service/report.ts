/**
 * レポートサービス
 */
import * as OrderService from './report/order';
import * as OwnershipInfoService from './report/ownershipInfo';
import * as TelemetryService from './report/telemetry';
import * as TransactionService from './report/transaction';

export {
    OrderService as order,
    OwnershipInfoService as ownershipInfo,
    TelemetryService as telemetry,
    TransactionService as transaction
};
