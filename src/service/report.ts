/**
 * レポートサービス
 */
import * as OwnershipInfoService from './report/ownershipInfo';
import * as TelemetryService from './report/telemetry';
import * as TransactionService from './report/transaction';

export {
    OwnershipInfoService as ownershipInfo,
    TelemetryService as telemetry,
    TransactionService as transaction
};
