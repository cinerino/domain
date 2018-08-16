
import * as factory from '@cinerino/factory';
import * as moment from 'moment';
import { Connection } from 'mongoose';
import eventModel from './mongoose/model/event';

/**
 * イベント抽象リポジトリー
 */
export abstract class Repository {
    public abstract async saveScreeningEventSeries(screeningEvent: factory.chevre.event.screeningEvent.IEvent): Promise<void>;
    public abstract async saveScreeningEvent(
        screeningEvent: factory.chevre.event.screeningEvent.IEvent
    ): Promise<void>;
    public abstract async cancelScreeningEvent(id: string): Promise<void>;
    public abstract async searchScreeningEvents(
        searchConditions: factory.chevre.event.screeningEvent.ISearchConditions
    ): Promise<factory.chevre.event.screeningEvent.IEvent[]>;
    public abstract async findScreeningEventById(id: string): Promise<factory.chevre.event.screeningEvent.IEvent>;
}

/**
 * イベントリポジトリー
 */
export class MongoRepository implements Repository {
    public readonly eventModel: typeof eventModel;
    constructor(connection: Connection) {
        this.eventModel = connection.model(eventModel.modelName);
    }
    /**
     * 上映イベントを保管する
     * @param screeningEvent screeningEvent object
     */
    public async saveScreeningEventSeries(screeningEvent: factory.chevre.event.screeningEvent.IEvent) {
        await this.eventModel.findOneAndUpdate(
            {
                _id: screeningEvent.id,
                typeOf: factory.chevre.eventType.ScreeningEventSeries
            },
            screeningEvent,
            { upsert: true }
        ).exec();
    }
    /**
     * 上映イベントを保管する
     */
    public async saveScreeningEvent(screeningEvent: factory.chevre.event.screeningEvent.IEvent) {
        await this.eventModel.findOneAndUpdate(
            {
                _id: screeningEvent.id,
                typeOf: factory.chevre.eventType.ScreeningEvent
            },
            screeningEvent,
            { new: true, upsert: true }
        ).exec();
    }
    /**
     * 上映イベントをキャンセルする
     */
    public async cancelScreeningEvent(id: string) {
        await this.eventModel.findOneAndUpdate(
            {
                _id: id,
                typeOf: factory.chevre.eventType.ScreeningEvent
            },
            { eventStatus: factory.chevre.eventStatusType.EventCancelled },
            { new: true }
        ).exec();
    }
    /**
     * 上映イベントを検索する
     */
    public async searchScreeningEvents(
        searchConditions: factory.chevre.event.screeningEvent.ISearchConditions
    ): Promise<factory.chevre.event.screeningEvent.IEvent[]> {
        // MongoDB検索条件
        const andConditions: any[] = [
            {
                typeOf: factory.chevre.eventType.ScreeningEvent
            }
        ];

        // 場所の識別子条件
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(searchConditions.superEventLocationIds)) {
            andConditions.push({
                'superEvent.location.id': {
                    $exists: true,
                    $in: searchConditions.superEventLocationIds
                }
            });
        }

        // イベントステータス条件
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(searchConditions.eventStatuses)) {
            andConditions.push({
                eventStatus: { $in: searchConditions.eventStatuses }
            });
        }

        // 作品識別子条件
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(searchConditions.workPerformedIds)) {
            andConditions.push({
                'workPerformed.id': { $in: searchConditions.workPerformedIds }
            });
        }

        // 開始日時条件
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (searchConditions.startFrom !== undefined) {
            andConditions.push({
                startDate: { $gte: searchConditions.startFrom }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (searchConditions.startThrough !== undefined) {
            andConditions.push({
                startDate: { $lt: searchConditions.startThrough }
            });
        }

        // 終了日時条件
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (searchConditions.endFrom !== undefined) {
            andConditions.push({
                endDate: { $gte: searchConditions.endFrom }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (searchConditions.endThrough !== undefined) {
            andConditions.push({
                endDate: { $lt: searchConditions.endThrough }
            });
        }

        return <factory.chevre.event.screeningEvent.IEvent[]>await this.eventModel.find({ $and: andConditions })
            .sort({ startDate: 1 })
            .setOptions({ maxTimeMS: 10000 })
            .exec()
            .then((docs) => docs.map((doc) => doc.toObject()));
    }
    /**
     * IDで上映イベントを取得する
     */
    public async findScreeningEventById(id: string): Promise<factory.chevre.event.screeningEvent.IEvent> {
        const event = await this.eventModel.findOne({
            typeOf: factory.chevre.eventType.ScreeningEvent,
            _id: id
        }).exec();
        if (event === null) {
            throw new factory.errors.NotFound('screeningEvent');
        }

        return event.toObject();
    }
}
