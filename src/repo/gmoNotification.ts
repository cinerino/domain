import * as GMO from '@motionpicture/gmo-service';
import * as moment from 'moment-timezone';
import { Connection } from 'mongoose';
import GMONotificationModel from './mongoose/model/gmoNotification';

/**
 * GMO通知リポジトリー
 */
export class MongoRepository {
    public readonly gmoNotificationModel: typeof GMONotificationModel;

    constructor(connection: Connection) {
        this.gmoNotificationModel = connection.model(GMONotificationModel.modelName);
    }

    /**
     * 通知を保管する
     * @param notification GMO結果通知オブジェクト
     */
    public async save(notification: GMO.factory.resultNotification.creditCard.IResultNotification) {
        await this.gmoNotificationModel.create(notification);
    }

    /**
     * GMO実売上検索
     * @param searchConditions.tranDateFrom 処理日時from
     * @param searchConditions.tranDateThrough 処理日時through
     * @returns GMO結果通知リスト
     */
    public async searchSales(searchConditions: {
        tranDateFrom: Date;
        tranDateThrough: Date;
    }): Promise<GMO.factory.resultNotification.creditCard.IResultNotification[]> {
        // 'tranDate': '20170415230109'の形式
        return <GMO.factory.resultNotification.creditCard.IResultNotification[]>await this.gmoNotificationModel.find(
            {
                jobCd: GMO.utils.util.JobCd.Sales,
                tranDate: {
                    $gte: moment(searchConditions.tranDateFrom).tz('Asia/Tokyo').format('YYYYMMDDHHmmss'),
                    $lte: moment(searchConditions.tranDateThrough).tz('Asia/Tokyo').format('YYYYMMDDHHmmss')
                }
            }
        ).lean().exec();
    }
}
