/**
 * マスターデータ同期サービス
 */
import * as COA from '@motionpicture/coa-service';
import * as createDebug from 'debug';
// import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';
// @ts-ignore
import * as difference from 'lodash.difference';
import * as moment from 'moment-timezone';

import { MongoRepository as EventRepo } from '../repo/event';
import { IEvent as IEventCapcity, RedisRepository as EventAttendeeCapacityRepo } from '../repo/event/attendeeCapacity';
import { MongoRepository as SellerRepo } from '../repo/seller';

import * as factory from '../factory';

import { credentials } from '../credentials';

const debug = createDebug('cinerino-domain:service');

// tslint:disable-next-line:no-magic-numbers
const COA_TIMEOUT = (typeof process.env.COA_TIMEOUT === 'string') ? Number(process.env.COA_TIMEOUT) : 20000;

const coaAuthClient = new COA.auth.RefreshToken({
    endpoint: credentials.coa.endpoint,
    refreshToken: credentials.coa.refreshToken
});

/**
 * 映画作品インポート
 */
// export function importMovies(theaterCode: string) {
//     return async (repos: { creativeWork: CreativeWorkRepo }) => {
//         // COAから作品取得
//         const filmsFromCOA = await masterService.title({ theaterCode: theaterCode });

//         // 永続化
//         await Promise.all(filmsFromCOA.map(async (filmFromCOA) => {
//             const movie = createMovieFromCOA(filmFromCOA);
//             debug('storing movie...', movie);
//             await repos.creativeWork.saveMovie(movie);
//             debug('movie stored.');
//         }));
//     };
// }

// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
// function createMovieFromCOA(filmFromCOA: COA.factory.master.ITitleResult): factory.chevre.creativeWork.movie.ICreativeWork {
//     return {
//         identifier: filmFromCOA.titleCode,
//         name: filmFromCOA.titleNameOrig,
//         duration: moment.duration(filmFromCOA.showTime, 'm').toISOString(),
//         contentRating: filmFromCOA.kbnEirin,
//         typeOf: factory.creativeWorkType.Movie
//     };
// }

/**
 * XMLに存在するスケジュールかどうかを判定する
 */
export function matchWithXML(
    xmlSchedules: COA.factory.master.IXMLScheduleResult[][],
    coaSchedule: COA.factory.master.IScheduleResult
): boolean {
    return xmlSchedules.some((xmlSchedule) => {
        return xmlSchedule.some((schedule) => {
            return schedule.date === coaSchedule.dateJouei
                && schedule.movie.some((movie) => {
                    return movie.movieShortCode === coaSchedule.titleCode
                        && movie.screen.some((screen) => {
                            return screen.screenCode === coaSchedule.screenCode
                                && screen.time.some(
                                    (time) => time.startTime === coaSchedule.timeBegin && time.endTime === coaSchedule.timeEnd
                                );
                        });
                });
        });
    });
}

/**
 * COAからイベントをインポートする
 */
export function importScreeningEvents(params: factory.task.IData<factory.taskName.ImportScreeningEvents>) {
    return async (repos: {
        event: EventRepo;
        seller: SellerRepo;
    }) => {
        const project: factory.project.IProject = params.project;

        const masterService = new COA.service.Master({
            endpoint: credentials.coa.endpoint,
            auth: coaAuthClient
        });

        // 劇場取得
        const movieTheater = createMovieTheaterFromCOA(
            project,
            await masterService.theater({ theaterCode: params.locationBranchCode }),
            await masterService.screen({ theaterCode: params.locationBranchCode })
        );

        const sellers = await repos.seller.search({
            location: { branchCodes: [params.locationBranchCode] }
        });
        const seller = sellers.shift();
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (seller === undefined) {
            throw new factory.errors.NotFound('Seller');
        }

        let xmlEndPoint: any;
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(seller.additionalProperty)) {
            const xmlEndPointProperty = seller.additionalProperty.find(((p: any) => {
                return p.name === 'xmlEndPoint';
            }));
            xmlEndPoint = (xmlEndPointProperty !== undefined) ? JSON.parse(xmlEndPointProperty.value) : undefined;
        }

        const targetImportFrom = moment(`${moment(params.importFrom)
            .tz('Asia/Tokyo')
            .format('YYYY-MM-DD')}T00:00:00+09:00`);
        const targetImportThrough = moment(`${moment(params.importThrough)
            .tz('Asia/Tokyo')
            .format('YYYY-MM-DD')}T00:00:00+09:00`)
            .add(1, 'day');
        debug('importing screening events...', targetImportFrom, targetImportThrough);

        let schedulesFromXML: COA.factory.master.IXMLScheduleResult[][] = [];
        if (xmlEndPoint !== undefined) {
            try {
                debug('finding xmlSchedule...', xmlEndPoint.theaterCodeName);
                schedulesFromXML = await masterService.xmlSchedule({
                    baseUrl: xmlEndPoint.baseUrl,
                    theaterCodeName: xmlEndPoint.theaterCodeName
                });
            } catch (err) {
                // tslint:disable-next-line:no-console
                console.error(err);
            }
        }

        // xmlEndPointがない場合、処理を続きます
        if (xmlEndPoint === undefined || schedulesFromXML.length > 0) {
            const screeningEventSerieses = await saveScreeningEventSeries({
                locationBranchCode: params.locationBranchCode,
                movieTheater: movieTheater,
                project: project
            })(repos);

            // イベントごとに永続化トライ
            const screeningEvents = await saveScreeningEvents({
                xmlEndPoint: xmlEndPoint,
                schedulesFromXML: schedulesFromXML,
                locationBranchCode: params.locationBranchCode,
                movieTheater: movieTheater,
                screeningEventSerieses: screeningEventSerieses,
                project: project,
                targetImportFrom: targetImportFrom.toDate(),
                targetImportThrough: targetImportThrough.toDate()
            })(repos);

            // COAから削除されたイベントをキャンセル済ステータスへ変更
            await cancelDeletedEvents({
                locationBranchCode: params.locationBranchCode,
                targetImportFrom: targetImportFrom.toDate(),
                targetImportThrough: targetImportThrough.toDate(),
                idsShouldBe: screeningEvents.map((e) => e.id)
            })(repos);
        }
    };
}

function saveScreeningEventSeries(params: {
    locationBranchCode: string;
    movieTheater: factory.chevre.place.movieTheater.IPlace;
    project: factory.project.IProject;
}) {
    return async (repos: {
        event: EventRepo;
    }): Promise<factory.event.screeningEventSeries.IEvent[]> => {
        const movieTheater = params.movieTheater;
        const project = params.project;

        const masterService = new COA.service.Master({
            endpoint: credentials.coa.endpoint,
            auth: coaAuthClient
        });

        // COAから作品取得
        const filmsFromCOA = await masterService.title({
            theaterCode: params.locationBranchCode
        });

        // COAから区分マスター抽出
        const eirinKubuns = await masterService.kubunName({
            theaterCode: params.locationBranchCode,
            kubunClass: '044'
        });
        const eizouKubuns = await masterService.kubunName({
            theaterCode: params.locationBranchCode,
            kubunClass: '042'
        });
        const joueihousikiKubuns = await masterService.kubunName({
            theaterCode: params.locationBranchCode,
            kubunClass: '045'
        });
        const jimakufukikaeKubuns = await masterService.kubunName({
            theaterCode: params.locationBranchCode,
            kubunClass: '043'
        });
        debug('kubunNames found.');

        const screeningEventSerieses = filmsFromCOA.map((filmFromCOA) => {
            return createScreeningEventSeriesFromCOA({
                project: project,
                filmFromCOA: filmFromCOA,
                movieTheater: movieTheater,
                eirinKubuns: eirinKubuns,
                eizouKubuns: eizouKubuns,
                joueihousikiKubuns: joueihousikiKubuns,
                jimakufukikaeKubuns: jimakufukikaeKubuns
            });
        });
        // 永続化
        for (const screeningEventSeries of screeningEventSerieses) {
            await repos.event.save(screeningEventSeries);
        }

        return screeningEventSerieses;
    };
}

function saveScreeningEvents(params: {
    xmlEndPoint?: any;
    schedulesFromXML: COA.factory.master.IXMLScheduleResult[][];
    locationBranchCode: string;
    movieTheater: factory.chevre.place.movieTheater.IPlace;
    screeningEventSerieses: factory.event.IEvent<factory.chevre.eventType.ScreeningEventSeries>[];
    project: factory.project.IProject;
    targetImportFrom: Date;
    targetImportThrough: Date;
}) {
    return async (repos: {
        event: EventRepo;
    }): Promise<factory.event.screeningEvent.IEvent[]> => {
        const xmlEndPoint = params.xmlEndPoint;
        const schedulesFromXML = params.schedulesFromXML;
        const movieTheater = params.movieTheater;
        const screeningEventSerieses = params.screeningEventSerieses;
        const project = params.project;

        const masterService = new COA.service.Master({
            endpoint: credentials.coa.endpoint,
            auth: coaAuthClient
        });

        // COAからイベント取得;
        const schedulesFromCOA = await masterService.schedule({
            theaterCode: params.locationBranchCode,
            begin: moment(params.targetImportFrom)
                .tz('Asia/Tokyo')
                .format('YYYYMMDD'), // COAは日本時間で判断
            end: moment(params.targetImportThrough)
                .add(-1, 'day')
                .tz('Asia/Tokyo')
                .format('YYYYMMDD') // COAは日本時間で判断
        });

        // COAから区分マスター抽出
        const serviceKubuns = await masterService.kubunName({
            theaterCode: params.locationBranchCode,
            kubunClass: '009'
        });
        const acousticKubuns = await masterService.kubunName({
            theaterCode: params.locationBranchCode,
            kubunClass: '046'
        });

        // イベントごとに永続化トライ
        const screeningEvents: factory.event.screeningEvent.IEvent[] = [];
        schedulesFromCOA.forEach((scheduleFromCOA) => {
            if (xmlEndPoint === undefined || matchWithXML(schedulesFromXML, scheduleFromCOA)) {
                const screeningEventSeriesId = createScreeningEventSeriesId({
                    theaterCode: params.locationBranchCode,
                    titleCode: scheduleFromCOA.titleCode,
                    titleBranchNum: scheduleFromCOA.titleBranchNum
                });

                // スクリーン存在チェック
                const screenRoom = <factory.chevre.place.screeningRoom.IPlace | undefined>movieTheater.containsPlace.find(
                    (place) => place.branchCode === scheduleFromCOA.screenCode
                );
                if (screenRoom === undefined) {
                    // tslint:disable-next-line:no-console
                    console.error('screenRoom not found.', scheduleFromCOA.screenCode);

                    return;
                }

                // イベントシリーズ取得
                const screeningEventSeries = screeningEventSerieses.find((e) => e.id === screeningEventSeriesId);
                if (screeningEventSeries === undefined) {
                    // tslint:disable-next-line:no-console
                    console.error('screeningEventSeries not found.', screeningEventSeriesId);

                    return;
                }

                const screeningEvent = createScreeningEventFromCOA({
                    project: project,
                    performanceFromCOA: scheduleFromCOA,
                    screenRoom: screenRoom,
                    superEvent: screeningEventSeries,
                    serviceKubuns: serviceKubuns,
                    acousticKubuns: acousticKubuns
                });
                screeningEvents.push(screeningEvent);
            }
        });

        // 永続化
        debug(`storing ${screeningEvents.length} screeningEvents...`);
        for (const screeningEvent of screeningEvents) {
            try {
                await repos.event.save<factory.chevre.eventType.ScreeningEvent>(screeningEvent);
            } catch (error) {
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next */
                // tslint:disable-next-line:no-console
                console.error(error);
            }
        }
        debug(`${screeningEvents.length} screeningEvents stored.`);

        return screeningEvents;
    };
}

function cancelDeletedEvents(params: {
    locationBranchCode: string;
    targetImportFrom: Date;
    targetImportThrough: Date;
    idsShouldBe: string[];
}) {
    return async (repos: {
        event: EventRepo;
    }) => {
        // COAから削除されたイベントをキャンセル済ステータスへ変更
        const ids = await repos.event.search({
            typeOf: factory.chevre.eventType.ScreeningEvent,
            superEvent: {
                locationBranchCodes: [params.locationBranchCode]
            },
            startFrom: params.targetImportFrom,
            startThrough: params.targetImportThrough
        })
            .then((events) => events.map((e) => e.id));
        const idsShouldBe = params.idsShouldBe;
        const cancelledIds = difference(ids, idsShouldBe);
        debug(`cancelling ${cancelledIds.length} events...`);
        for (const cancelledId of cancelledIds) {
            try {
                await repos.event.cancel({ id: cancelledId });
            } catch (error) {
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next */
                // tslint:disable-next-line:no-console
                console.error(error);
            }
        }
        debug(`${cancelledIds.length} events cancelled.`);
    };
}

/**
 * 劇場インポート
 */
// export function importMovieTheater(theaterCode: string) {
//     return async (repos: {
//         place: PlaceRepo;
//         seller: SellerRepo;
//     }): Promise<void> => {
//         const movieTheater = createMovieTheaterFromCOA(
//             await masterService.theater({ theaterCode: theaterCode }),
//             await masterService.screen({ theaterCode: theaterCode })
//         );

//         // 場所を保管
//         debug('storing movieTheater...', movieTheater);
//         await repos.place.saveMovieTheater(movieTheater);
//         debug('movieTheater stored.');

//         // 日本語フォーマットで電話番号が提供される想定なので変換
//         let formatedPhoneNumber: string;
//         try {
//             const phoneUtil = PhoneNumberUtil.getInstance();
//             const phoneNumber = phoneUtil.parse(movieTheater.telephone, 'JP');
//             // tslint:disable-next-line:no-single-line-block-comment
//             /* istanbul ignore if */
//             if (!phoneUtil.isValidNumber(phoneNumber)) {
//                 throw new Error('Invalid phone number format.');
//             }

//             formatedPhoneNumber = phoneUtil.format(phoneNumber, PhoneNumberFormat.E164);
//         } catch (error) {
//             // tslint:disable-next-line:no-single-line-block-comment
//             /* istanbul ignore next */
//             throw new Error(`電話番号フォーマット時に問題が発生しました:${error.message}`);
//         }

//         // 組織の属性を更新
//         await repos.seller.organizationModel.findOneAndUpdate(
//             {
//                 typeOf: factory.organizationType.MovieTheater,
//                 'location.branchCode': movieTheater.branchCode
//             },
//             {
//                 'name.ja': movieTheater.name.ja,
//                 'name.en': movieTheater.name.en,
//                 'location.name.ja': movieTheater.name.ja,
//                 'location.name.en': movieTheater.name.en,
//                 telephone: formatedPhoneNumber
//             }
//         )
//             .exec();
//     };
// }

/**
 * コアデータからイベントを作成する
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
// tslint:disable-next-line:max-func-body-length
export function createScreeningEventFromCOA(params: {
    project: { typeOf: factory.organizationType.Project; id: string };
    performanceFromCOA: COA.factory.master.IScheduleResult;
    screenRoom: factory.chevre.place.screeningRoom.IPlace;
    superEvent: factory.event.screeningEventSeries.IEvent;
    serviceKubuns: COA.factory.master.IKubunNameResult[];
    acousticKubuns: COA.factory.master.IKubunNameResult[];
}): factory.event.screeningEvent.IEvent {
    const id = createScreeningEventIdFromCOA({
        theaterCode: params.superEvent.location.branchCode,
        titleCode: params.superEvent.workPerformed.identifier,
        titleBranchNum: params.performanceFromCOA.titleBranchNum,
        dateJouei: params.performanceFromCOA.dateJouei,
        screenCode: params.performanceFromCOA.screenCode,
        timeBegin: params.performanceFromCOA.timeBegin
    });

    // COA情報を整形して開始日時と終了日時を作成('2500'のような日またぎの時刻入力に対応)
    const DAY = 2400;
    let timeBegin = params.performanceFromCOA.timeBegin;
    let timeEnd = params.performanceFromCOA.timeEnd;
    let addDay4startDate = 0;
    let addDay4endDate = 0;
    try {
        addDay4startDate += Math.floor(Number(timeBegin) / DAY);
        // tslint:disable-next-line:no-magic-numbers
        timeBegin = `0000${Number(timeBegin) % DAY}`.slice(-4);

        addDay4endDate += Math.floor(Number(timeEnd) / DAY);
        // tslint:disable-next-line:no-magic-numbers
        timeEnd = `0000${Number(timeEnd) % DAY}`.slice(-4);
    } catch (error) {
        // no op
    }

    let endDate = moment(`${params.performanceFromCOA.dateJouei} ${timeEnd} +09:00`, 'YYYYMMDD HHmm Z')
        .add(addDay4endDate, 'days')
        .toDate();
    const startDate = moment(`${params.performanceFromCOA.dateJouei} ${timeBegin} +09:00`, 'YYYYMMDD HHmm Z')
        .add(addDay4startDate, 'days')
        .toDate();

    // startDateの方が大きければ日またぎイベントなので調整
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore if */
    if (moment(startDate)
        .isAfter(moment(endDate))) {
        endDate = moment(endDate)
            .add(1, 'day')
            .toDate();
    }

    const validFrom = moment(`${params.performanceFromCOA.rsvStartDate} 00:00:00+09:00`, 'YYYYMMDD HH:mm:ssZ')
        .toDate();
    const validThrough = moment(`${params.performanceFromCOA.rsvEndDate} 00:00:00+09:00`, 'YYYYMMDD HH:mm:ssZ')
        .add(1, 'day')
        .toDate();

    const coaInfo: factory.chevre.event.screeningEvent.ICOAInfo = {
        theaterCode: params.superEvent.location.branchCode,
        dateJouei: params.performanceFromCOA.dateJouei,
        titleCode: params.performanceFromCOA.titleCode,
        titleBranchNum: params.performanceFromCOA.titleBranchNum,
        timeBegin: params.performanceFromCOA.timeBegin,
        timeEnd: params.performanceFromCOA.timeEnd,
        screenCode: params.performanceFromCOA.screenCode,
        trailerTime: params.performanceFromCOA.trailerTime,
        kbnService: params.serviceKubuns.filter((kubun) => kubun.kubunCode === params.performanceFromCOA.kbnService)[0],
        kbnAcoustic: params.acousticKubuns.filter((kubun) => kubun.kubunCode === params.performanceFromCOA.kbnAcoustic)[0],
        nameServiceDay: params.performanceFromCOA.nameServiceDay,
        availableNum: params.performanceFromCOA.availableNum,
        rsvStartDate: params.performanceFromCOA.rsvStartDate,
        rsvEndDate: params.performanceFromCOA.rsvEndDate,
        flgEarlyBooking: params.performanceFromCOA.flgEarlyBooking
    };

    // const acceptedPaymentMethod: factory.paymentMethodType[] | undefined =
    //     (params.screeningEventSeries.offers !== undefined) ? params.screeningEventSeries.offers.acceptedPaymentMethod : undefined;

    const offers: factory.event.screeningEvent.IOffer = {
        project: { typeOf: params.project.typeOf, id: params.project.id },
        id: '',
        identifier: '',
        name: {
            ja: '',
            en: ''
        },
        typeOf: factory.chevre.offerType.Offer,
        priceCurrency: factory.priceCurrency.JPY,
        // acceptedPaymentMethod: acceptedPaymentMethod,
        availabilityEnds: validThrough,
        availabilityStarts: validFrom,
        validFrom: validFrom,
        validThrough: validThrough,
        eligibleQuantity: {
            maxValue: params.performanceFromCOA.availableNum,
            unitCode: factory.chevre.unitCode.C62,
            typeOf: 'QuantitativeValue'
        },
        itemOffered: {
            serviceType: <any>{
                project: { typeOf: params.project.typeOf, id: params.project.id },
                typeOf: 'CategoryCode'
            }
        },
        offeredThrough: {
            typeOf: 'WebAPI',
            identifier: factory.service.webAPI.Identifier.COA
        }
    };

    return {
        project: { typeOf: params.project.typeOf, id: params.project.id },
        typeOf: factory.chevre.eventType.ScreeningEvent,
        id: id,
        identifier: id,
        name: params.superEvent.name,
        eventStatus: factory.chevre.eventStatusType.EventScheduled,
        workPerformed: params.superEvent.workPerformed,
        location: {
            project: { typeOf: params.project.typeOf, id: params.project.id },
            typeOf: <factory.chevre.placeType.ScreeningRoom>params.screenRoom.typeOf,
            branchCode: params.screenRoom.branchCode,
            name: params.screenRoom.name
        },
        endDate: endDate,
        startDate: startDate,
        superEvent: params.superEvent,
        coaInfo: coaInfo,
        offers: offers,
        checkInCount: 0,
        attendeeCount: 0,
        maximumAttendeeCapacity: params.screenRoom.maximumAttendeeCapacity,
        remainingAttendeeCapacity: params.screenRoom.maximumAttendeeCapacity,
        additionalProperty: [
            {
                name: 'COA_ENDPOINT',
                value: <string>process.env.COA_ENDPOINT
            },
            {
                name: 'coaInfo',
                value: JSON.stringify(coaInfo)
            }
        ]
    };
}

/**
 * COAの作品抽出結果からFilmオブジェクトを作成する
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
export function createScreeningEventSeriesFromCOA(params: {
    project: { typeOf: factory.organizationType.Project; id: string };
    filmFromCOA: COA.factory.master.ITitleResult;
    movieTheater: factory.chevre.place.movieTheater.IPlace;
    eirinKubuns: COA.factory.master.IKubunNameResult[];
    eizouKubuns: COA.factory.master.IKubunNameResult[];
    joueihousikiKubuns: COA.factory.master.IKubunNameResult[];
    jimakufukikaeKubuns: COA.factory.master.IKubunNameResult[];
}): factory.event.screeningEventSeries.IEvent {
    const endDate = (moment(`${params.filmFromCOA.dateEnd} +09:00`, 'YYYYMMDD Z')
        .isValid())
        ? moment(`${params.filmFromCOA.dateEnd} +09:00`, 'YYYYMMDD Z')
            .toDate()
        : undefined;
    const startDate = (moment(`${params.filmFromCOA.dateBegin} +09:00`, 'YYYYMMDD Z')
        .isValid())
        ? moment(`${params.filmFromCOA.dateBegin} +09:00`, 'YYYYMMDD Z')
            .toDate()
        : undefined;
    // title_codeは劇場をまたいで共有、title_branch_numは劇場毎に管理
    const id = createScreeningEventSeriesId({
        theaterCode: params.movieTheater.branchCode,
        titleCode: params.filmFromCOA.titleCode,
        titleBranchNum: params.filmFromCOA.titleBranchNum
    });

    const coaInfo: factory.event.screeningEventSeries.ICOAInfo = {
        titleBranchNum: params.filmFromCOA.titleBranchNum,
        kbnEirin: params.eirinKubuns.filter((k) => k.kubunCode === params.filmFromCOA.kbnEirin)[0],
        kbnEizou: params.eizouKubuns.filter((k) => k.kubunCode === params.filmFromCOA.kbnEizou)[0],
        kbnJoueihousiki: params.joueihousikiKubuns.filter((k) => k.kubunCode === params.filmFromCOA.kbnJoueihousiki)[0],
        kbnJimakufukikae: params.jimakufukikaeKubuns.filter((k) => k.kubunCode === params.filmFromCOA.kbnJimakufukikae)[0],
        flgMvtkUse: params.filmFromCOA.flgMvtkUse,
        dateMvtkBegin: params.filmFromCOA.dateMvtkBegin
    };

    const acceptedPaymentMethod: factory.paymentMethodType[] = [
        factory.paymentMethodType.Account,
        factory.paymentMethodType.Cash,
        factory.paymentMethodType.CreditCard,
        factory.paymentMethodType.EMoney
    ];

    if (coaInfo.flgMvtkUse === '1') {
        acceptedPaymentMethod.push(factory.paymentMethodType.MovieTicket);
    }

    return {
        project: { typeOf: params.project.typeOf, id: params.project.id },
        typeOf: factory.chevre.eventType.ScreeningEventSeries,
        eventStatus: factory.chevre.eventStatusType.EventScheduled,
        id: id,
        identifier: id,
        name: {
            ja: params.filmFromCOA.titleName,
            en: params.filmFromCOA.titleNameEng
        },
        kanaName: params.filmFromCOA.titleNameKana,
        alternativeHeadline: params.filmFromCOA.titleNameShort,
        location: {
            project: { typeOf: params.project.typeOf, id: params.project.id },
            id: (params.movieTheater.id !== undefined) ? params.movieTheater.id : '',
            branchCode: params.movieTheater.branchCode,
            name: params.movieTheater.name,
            kanaName: params.movieTheater.kanaName,
            typeOf: <factory.chevre.placeType.MovieTheater>params.movieTheater.typeOf
        },
        organizer: {
            typeOf: factory.chevre.organizationType.MovieTheater,
            identifier: params.movieTheater.id,
            name: params.movieTheater.name
        },
        videoFormat: params.eizouKubuns.filter((kubun) => kubun.kubunCode === params.filmFromCOA.kbnEizou)[0],
        soundFormat: [],
        workPerformed: {
            project: { typeOf: params.project.typeOf, id: params.project.id },
            id: `${params.movieTheater.branchCode}-${params.filmFromCOA.titleCode}`,
            identifier: params.filmFromCOA.titleCode,
            name: params.filmFromCOA.titleNameOrig,
            duration: moment.duration(params.filmFromCOA.showTime, 'm')
                .toISOString(),
            contentRating: params.eirinKubuns.filter((kubun) => kubun.kubunCode === params.filmFromCOA.kbnEirin)[0],
            typeOf: factory.chevre.creativeWorkType.Movie
        },
        duration: moment.duration(params.filmFromCOA.showTime, 'm')
            .toISOString(),
        endDate: endDate,
        startDate: startDate,
        coaInfo: coaInfo,
        offers: {
            project: { typeOf: params.project.typeOf, id: params.project.id },
            typeOf: factory.chevre.offerType.Offer,
            priceCurrency: factory.chevre.priceCurrency.JPY,
            acceptedPaymentMethod: acceptedPaymentMethod
        },
        additionalProperty: [
            {
                name: 'COA_ENDPOINT',
                value: <string>process.env.COA_ENDPOINT
            },
            {
                name: 'coaInfo',
                value: JSON.stringify(coaInfo)
            }
        ]
    };
}

/**
 * COA情報からイベントIDを作成する
 */
export function createScreeningEventIdFromCOA(params: {
    theaterCode: string;
    titleCode: string;
    titleBranchNum: string;
    dateJouei: string;
    screenCode: string;
    timeBegin: string;
}): string {
    return [
        createScreeningEventSeriesId(params),
        params.dateJouei,
        params.screenCode,
        params.timeBegin
    ].join('');
}

/**
 * COA情報からイベント識別子を作成する
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
export function createScreeningEventSeriesId(params: {
    theaterCode: string;
    titleCode: string;
    titleBranchNum: string;
}) {
    return [
        params.theaterCode,
        params.titleCode,
        params.titleBranchNum
    ].join('');
}

/**
 * コアマスター抽出結果から作成する
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
export function createMovieTheaterFromCOA(
    project: { typeOf: factory.organizationType.Project; id: string },
    theaterFromCOA: COA.factory.master.ITheaterResult,
    screensFromCOA: COA.factory.master.IScreenResult[]
): factory.chevre.place.movieTheater.IPlace {
    const id = `MovieTheater-${theaterFromCOA.theaterCode}`;

    return {
        project: { typeOf: project.typeOf, id: project.id },
        id: id,
        screenCount: screensFromCOA.length,
        branchCode: theaterFromCOA.theaterCode,
        name: {
            ja: theaterFromCOA.theaterName,
            en: theaterFromCOA.theaterNameEng
        },
        kanaName: theaterFromCOA.theaterNameKana,
        containsPlace: screensFromCOA.map((screenFromCOA) => {
            return createScreeningRoomFromCOA(project, screenFromCOA);
        }),
        typeOf: factory.chevre.placeType.MovieTheater,
        telephone: theaterFromCOA.theaterTelNum
    };
}

/**
 * コアスクリーン抽出結果から上映室を作成する
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
export function createScreeningRoomFromCOA(
    project: { typeOf: factory.organizationType.Project; id: string },
    screenFromCOA: COA.factory.master.IScreenResult
): factory.chevre.place.screeningRoom.IPlace {
    const sections: factory.chevre.place.screeningRoomSection.IPlaceWithOffer[] = [];
    const sectionCodes: string[] = [];
    screenFromCOA.listSeat.forEach((seat) => {
        if (sectionCodes.indexOf(seat.seatSection) < 0) {
            sectionCodes.push(seat.seatSection);
            sections.push({
                project: { typeOf: project.typeOf, id: project.id },
                branchCode: seat.seatSection,
                name: {
                    ja: `セクション${seat.seatSection}`,
                    en: `section${seat.seatSection}`
                },
                containsPlace: [],
                typeOf: factory.chevre.placeType.ScreeningRoomSection
            });
        }

        sections[sectionCodes.indexOf(seat.seatSection)].containsPlace.push({
            project: { typeOf: project.typeOf, id: project.id },
            branchCode: seat.seatNum,
            typeOf: factory.chevre.placeType.Seat,
            additionalProperty: [
                { name: 'flgFree', value: String(seat.flgFree) },
                { name: 'flgHc', value: String(seat.flgHc) },
                { name: 'flgPair', value: String(seat.flgPair) },
                { name: 'flgSpare', value: String(seat.flgSpare) },
                { name: 'flgSpecial', value: String(seat.flgSpecial) }
            ]
        });
    });

    return {
        project: { typeOf: project.typeOf, id: project.id },
        containsPlace: sections,
        branchCode: screenFromCOA.screenCode,
        name: {
            ja: screenFromCOA.screenName,
            en: screenFromCOA.screenNameEng
        },
        typeOf: factory.chevre.placeType.ScreeningRoom,
        maximumAttendeeCapacity: sections[0].containsPlace.length
    };
}

/**
 * イベント席数を更新する
 */
export function updateEventAttendeeCapacity(params: factory.task.IData<factory.taskName.UpdateEventAttendeeCapacity>) {
    return async (repos: {
        attendeeCapacity: EventAttendeeCapacityRepo;
    }) => {
        const reserveService = new COA.service.Reserve(
            {
                endpoint: credentials.coa.endpoint,
                auth: coaAuthClient
            },
            { timeout: COA_TIMEOUT }
        );

        // COAから空席状況取得
        const countFreeSeatResult = await reserveService.countFreeSeat({
            theaterCode: params.locationBranchCode,
            begin: moment(params.importFrom)
                .tz('Asia/Tokyo')
                .format('YYYYMMDD'), // COAは日本時間で判断
            end: moment(params.importThrough)
                .tz('Asia/Tokyo')
                .format('YYYYMMDD') // COAは日本時間で判断
        });

        const capacities: IEventCapcity[] = [];

        countFreeSeatResult.listDate.forEach((countFreeSeatDate) => {
            countFreeSeatDate.listPerformance.forEach((countFreeSeatPerformance) => {
                const eventId = createScreeningEventIdFromCOA({
                    theaterCode: countFreeSeatResult.theaterCode,
                    titleCode: countFreeSeatPerformance.titleCode,
                    titleBranchNum: countFreeSeatPerformance.titleBranchNum,
                    dateJouei: countFreeSeatDate.dateJouei,
                    screenCode: countFreeSeatPerformance.screenCode,
                    timeBegin: countFreeSeatPerformance.timeBegin
                });

                capacities.push({
                    id: eventId,
                    remainingAttendeeCapacity: Math.max(0, Number(countFreeSeatPerformance.cntReserveFree))
                });
            });
        });

        await repos.attendeeCapacity.updateByEventIds(capacities);
    };
}
