import * as moment from 'moment';
import * as mongoose from 'mongoose';

import * as factory from '../factory';
import { modelName } from './mongoose/model/event';

/**
 * イベントリポジトリ
 */
export class MongoRepository {
    public readonly eventModel: typeof mongoose.Model;

    constructor(connection: mongoose.Connection) {
        this.eventModel = connection.model(modelName);
    }

    // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
    public static CREATE_MONGO_CONDITIONS<T extends factory.chevre.eventType>(
        params: factory.event.ISearchConditions<T>
    ) {
        // dayプロパティがあればstartFrom & startThroughに変換(互換性維持のため)
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if ((<any>params).day !== undefined) {
            params.startFrom = moment(`${(<any>params).day} +09:00`, 'YYYYMMDD Z')
                .toDate();
            params.startThrough = moment(`${(<any>params).day} +09:00`, 'YYYYMMDD Z')
                .add(1, 'day')
                .toDate();
        }

        // デフォルト値セット
        if (typeof params.typeOf !== 'string') {
            params.typeOf = factory.chevre.eventType.ScreeningEvent;
        }

        const andConditions: any[] = [
            { typeOf: params.typeOf }
        ];

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.project !== undefined) {
            if (Array.isArray(params.project.ids)) {
                andConditions.push({
                    'project.id': {
                        $exists: true,
                        $in: params.project.ids
                    }
                });
            }
        }

        // theaterプロパティがあればbranchCodeで検索(互換性維持のため)
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if ((<any>params).theater !== undefined) {
            andConditions.push({
                'superEvent.location.branchCode': {
                    $exists: true,
                    $eq: (<any>params).theater
                }
            });
        }

        // 場所の識別子条件
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray((<any>params).superEventLocationIdentifiers)) {
            // identifierはv28.0.0で廃止したが、互換性維持のため、branchCodeでの検索に変換
            andConditions.push({
                'superEvent.location.branchCode': {
                    $exists: true,
                    $in: (<any>params).superEventLocationIdentifiers.map((i: string) => {
                        return i.toString()
                            .replace('MovieTheater-', '');
                    })
                }
            });
        }

        // 作品識別子条件
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray((<any>params).workPerformedIdentifiers)) {
            andConditions.push({
                'workPerformed.identifier': {
                    $exists: true,
                    $in: (<any>params).workPerformedIdentifiers
                }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.name !== undefined) {
            andConditions.push({
                $or: [
                    { 'name.ja': new RegExp(params.name, 'i') },
                    { 'name.en': new RegExp(params.name, 'i') }
                ]
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(params.eventStatuses)) {
            andConditions.push({
                eventStatus: { $in: params.eventStatuses }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.inSessionFrom !== undefined) {
            andConditions.push({
                endDate: { $gte: params.inSessionFrom }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.inSessionThrough !== undefined) {
            andConditions.push({
                startDate: { $lte: params.inSessionThrough }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.startFrom !== undefined) {
            andConditions.push({
                startDate: { $gte: params.startFrom }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.startThrough !== undefined) {
            andConditions.push({
                startDate: { $lte: params.startThrough }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.endFrom !== undefined) {
            andConditions.push({
                endDate: { $gte: params.endFrom }
            });
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (params.endThrough !== undefined) {
            andConditions.push({
                endDate: { $lte: params.endThrough }
            });
        }

        switch (params.typeOf) {
            case factory.chevre.eventType.ScreeningEvent:
                const superEventParams = (<factory.event.ISearchConditions<factory.chevre.eventType.ScreeningEvent>>params).superEvent;

                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (superEventParams !== undefined) {
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (Array.isArray(superEventParams.ids)) {
                        andConditions.push({
                            'superEvent.id': {
                                $exists: true,
                                $in: superEventParams.ids
                            }
                        });
                    }
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (Array.isArray(superEventParams.locationBranchCodes)) {
                        andConditions.push({
                            'superEvent.location.branchCode': {
                                $exists: true,
                                $in: superEventParams.locationBranchCodes
                            }
                        });
                    }
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (Array.isArray(superEventParams.workPerformedIdentifiers)) {
                        andConditions.push({
                            'superEvent.workPerformed.identifier': {
                                $exists: true,
                                $in: superEventParams.workPerformedIdentifiers
                            }
                        });
                    }
                }

                const offersParams = (<factory.event.ISearchConditions<factory.chevre.eventType.ScreeningEvent>>params).offers;

                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (offersParams !== undefined) {
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (offersParams.availableFrom instanceof Date) {
                        andConditions.push({
                            'offers.availabilityEnds': {
                                $exists: true,
                                $gte: offersParams.availableFrom
                            }
                        });
                    }
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (offersParams.availableThrough instanceof Date) {
                        andConditions.push({
                            'offers.availabilityStarts': {
                                $exists: true,
                                $lte: offersParams.availableThrough
                            }
                        });
                    }
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (offersParams.validFrom instanceof Date) {
                        andConditions.push({
                            'offers.validThrough': {
                                $exists: true,
                                $gte: offersParams.validFrom
                            }
                        });
                    }
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (offersParams.validThrough instanceof Date) {
                        andConditions.push({
                            'offers.validFrom': {
                                $exists: true,
                                $lte: offersParams.validThrough
                            }
                        });
                    }
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (Array.isArray(offersParams.ids)) {
                        andConditions.push({
                            'offers.id': {
                                $exists: true,
                                $in: offersParams.ids
                            }
                        });
                    }
                }

                break;

            default:
        }

        return andConditions;
    }

    /**
     * イベントをキャンセルする
     */
    public async cancel(params: {
        id: string;
    }) {
        await this.eventModel.findOneAndUpdate(
            { _id: params.id },
            { eventStatus: factory.chevre.eventStatusType.EventCancelled },
            { new: true }
        )
            .exec();
    }

    /**
     * イベントを保管する
     */
    public async save<T extends factory.chevre.eventType>(params: factory.event.IEvent<T>) {
        await this.eventModel.findOneAndUpdate(
            {
                _id: params.id,
                typeOf: params.typeOf
            },
            params,
            { new: true, upsert: true }
        )
            .exec();
    }

    public async count<T extends factory.chevre.eventType>(params: factory.event.ISearchConditions<T>): Promise<number> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);

        return this.eventModel.countDocuments((conditions.length > 0) ? { $and: conditions } : {})
            .setOptions({ maxTimeMS: 10000 })
            .exec();
    }

    /**
     * イベントを検索する
     */
    public async search<T extends factory.chevre.eventType>(
        params: factory.event.ISearchConditions<T>
    ): Promise<factory.event.IEvent<T>[]> {
        const conditions = MongoRepository.CREATE_MONGO_CONDITIONS(params);
        const query = this.eventModel.find(
            (conditions.length > 0) ? { $and: conditions } : {},
            {
                __v: 0,
                createdAt: 0,
                updatedAt: 0
            }
        );
        if (params.limit !== undefined && params.page !== undefined) {
            query.limit(params.limit)
                .skip(params.limit * (params.page - 1));
        }

        return query.sort({ startDate: 1 })
            .setOptions({ maxTimeMS: 10000 })
            .exec()
            .then((docs) => docs.map((doc) => doc.toObject()));
    }

    /**
     * 特定イベント検索
     */
    public async findById<T extends factory.chevre.eventType>(params: {
        id: string;
    }): Promise<factory.event.IEvent<T>> {
        const doc = await this.eventModel.findOne(
            {
                _id: params.id
            },
            {
                __v: 0,
                createdAt: 0,
                updatedAt: 0
            }
        )
            .exec();
        if (doc === null) {
            throw new factory.errors.NotFound(this.eventModel.modelName);
        }

        return doc.toObject();
    }
}
