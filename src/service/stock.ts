/**
 * 在庫管理サービス
 * 在庫仕入れ、在庫調整等
 */
import * as createDebug from 'debug';
import { google } from 'googleapis';
import * as moment from 'moment';

import * as chevre from '../chevre';
import * as COA from '../coa';
import * as factory from '../factory';
import { MongoRepository as ActionRepo } from '../repo/action';
import { MongoRepository as EventRepo } from '../repo/event';

const debug = createDebug('cinerino-domain:service');
const customsearch = google.customsearch('v1');

export type IPlaceOrderTransaction = factory.transaction.placeOrder.ITransaction;

/**
 * 上映イベントをインポートする
 */
export function importScreeningEvents(params: factory.task.IData<factory.taskName.ImportScreeningEvents>) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        event: EventRepo;
        eventService: chevre.service.Event;
    }) => {
        if (params.offeredThrough !== undefined && params.offeredThrough.identifier === factory.service.webAPI.Identifier.COA) {
            await importScreeningEventsFromCOA(params)(repos);

            return;
        }

        // 上映スケジュール取得
        const limit = 100;
        let page = 0;
        let numData: number = limit;
        const screeningEvents: factory.chevre.event.IEvent<factory.chevre.eventType.ScreeningEvent>[] = [];
        while (numData === limit) {
            page += 1;
            const searchScreeningEventsResult = await repos.eventService.searchScreeningEvents({
                limit: limit,
                page: page,
                inSessionFrom: params.importFrom,
                inSessionThrough: params.importThrough,
                superEvent: {
                    locationBranchCodes: [params.locationBranchCode]
                }
            });
            numData = searchScreeningEventsResult.data.length;
            debug('numData:', numData);
            screeningEvents.push(...searchScreeningEventsResult.data);
        }

        // 各作品画像を検索
        const movies = screeningEvents
            .map((e) => e.superEvent.workPerformed)
            .filter((movie, pos, arr) => arr.map((mapObj) => mapObj.identifier).indexOf(movie.identifier) === pos);
        const thumbnailsByMovie = await Promise.all(movies.map(async (movie) => {
            return {
                identifier: movie.identifier,
                thumbnail: await findMovieImage({ query: movie.name })
            };
        }));

        // 上映イベントごとに永続化トライ
        await Promise.all(screeningEvents.map(async (e) => {
            try {
                // サムネイル画像があれば情報追加
                const thumbnailOfMovie = thumbnailsByMovie.find(
                    (t) => t.identifier === e.superEvent.workPerformed.identifier
                );
                if (thumbnailOfMovie !== undefined && thumbnailOfMovie.thumbnail !== undefined) {
                    e.workPerformed.thumbnailUrl = thumbnailOfMovie.thumbnail;
                    e.superEvent.workPerformed.thumbnailUrl = thumbnailOfMovie.thumbnail;
                }

                const superEvent: chevre.factory.event.screeningEventSeries.IEvent = {
                    ...e.superEvent,
                    startDate: (e.superEvent.startDate !== undefined) ? moment(e.superEvent.startDate).toDate() : undefined,
                    endDate: (e.superEvent.endDate !== undefined) ? moment(e.superEvent.endDate).toDate() : undefined
                };

                const offers: factory.event.IOffer<factory.chevre.eventType.ScreeningEvent> = {
                    ...e.offers,
                    availabilityEnds: moment(e.offers.availabilityEnds).toDate(),
                    availabilityStarts: moment(e.offers.availabilityStarts).toDate(),
                    validFrom: moment(e.offers.validFrom).toDate(),
                    validThrough: moment(e.offers.validThrough).toDate(),
                    offeredThrough: { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.Chevre }
                };

                await repos.event.save<factory.chevre.eventType.ScreeningEvent>({
                    ...e,
                    superEvent: superEvent,
                    doorTime: (e.doorTime !== undefined) ? moment(e.doorTime).toDate() : undefined,
                    endDate: moment(e.endDate).toDate(),
                    startDate: moment(e.startDate).toDate(),
                    offers: offers
                });
            } catch (error) {
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next */
                console.error(error);
            }
        }));
        debug(`${screeningEvents.length} screeningEvents stored.`);
    };
}

export function importScreeningEventsFromCOA(params: {
    locationBranchCode: string;
    importFrom: Date;
    importThrough: Date;
    xmlEndPoint?: { baseUrl: string; theaterCodeName: string };
}) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        event: EventRepo;
    }) => {
        // 劇場取得
        // const theater = await COA.services.master.theater({ theaterCode: theaterCode });
        // const screens = await COA.services.master.screen({ theaterCode: theaterCode });
        // const movieTheater = await repos.place.findMovieTheaterByBranchCode(theaterCode);

        const movieTheater = createMovieTheaterFromCOA(
            await COA.services.master.theater({ theaterCode: params.locationBranchCode }),
            await COA.services.master.screen({ theaterCode: params.locationBranchCode })
        );

        // COAから作品取得
        const filmsFromCOA = await COA.services.master.title({
            theaterCode: params.locationBranchCode
        });

        const targetImportFrom = moment(`${moment(params.importFrom).tz('Asia/Tokyo').format('YYYY-MM-DD')}T00:00:00+09:00`);
        const targetImportThrough = moment(`${moment(params.importThrough)
            .tz('Asia/Tokyo').format('YYYY-MM-DD')}T00:00:00+09:00`).add(1, 'day');
        debug('importing screening events...', targetImportFrom, targetImportThrough);

        // COAから上映イベント取得
        debug(
            'finding schedules from COA...',
            moment(targetImportFrom).tz('Asia/Tokyo').format('YYYYMMDD'),
            moment(targetImportThrough).add(-1, 'day').tz('Asia/Tokyo').format('YYYYMMDD')
        );
        const schedulesFromCOA = await COA.services.master.schedule({
            theaterCode: params.locationBranchCode,
            begin: moment(targetImportFrom).tz('Asia/Tokyo').format('YYYYMMDD'), // COAは日本時間で判断
            end: moment(targetImportThrough).add(-1, 'day').tz('Asia/Tokyo').format('YYYYMMDD') // COAは日本時間で判断
        });

        let schedulesFromXML: COA.services.master.IXMLScheduleResult[][] = [];
        if (params.xmlEndPoint !== undefined) {
            try {
                schedulesFromXML = await COA.services.master.xmlSchedule({
                    baseUrl: params.xmlEndPoint.baseUrl,
                    theaterCodeName: params.xmlEndPoint.theaterCodeName
                });
            } catch (err) {
                console.error(err);
            }
        }

        // xmlEndPointがない場合、処理を続きます
        if (params.xmlEndPoint === undefined || schedulesFromXML.length > 0) {
            // COAから区分マスター抽出
            const serviceKubuns = await COA.services.master.kubunName({
                theaterCode: params.locationBranchCode,
                kubunClass: '009'
            });
            const acousticKubuns = await COA.services.master.kubunName({
                theaterCode: params.locationBranchCode,
                kubunClass: '046'
            });
            const eirinKubuns = await COA.services.master.kubunName({
                theaterCode: params.locationBranchCode,
                kubunClass: '044'
            });
            const eizouKubuns = await COA.services.master.kubunName({
                theaterCode: params.locationBranchCode,
                kubunClass: '042'
            });
            const joueihousikiKubuns = await COA.services.master.kubunName({
                theaterCode: params.locationBranchCode,
                kubunClass: '045'
            });
            const jimakufukikaeKubuns = await COA.services.master.kubunName({
                theaterCode: params.locationBranchCode,
                kubunClass: '043'
            });
            debug('kubunNames found.');

            // 永続化
            const screeningEventSerieses = await Promise.all(filmsFromCOA.map(async (filmFromCOA) => {
                const screeningEventSeries = createScreeningEventSeriesFromCOA({
                    filmFromCOA: filmFromCOA,
                    movieTheater: movieTheater,
                    eirinKubuns: eirinKubuns,
                    eizouKubuns: eizouKubuns,
                    joueihousikiKubuns: joueihousikiKubuns,
                    jimakufukikaeKubuns: jimakufukikaeKubuns
                });
                await repos.event.save(screeningEventSeries);

                return screeningEventSeries;
            }));

            // 上映イベントごとに永続化トライ
            const screeningEvents: factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>[] = [];
            schedulesFromCOA.forEach((scheduleFromCOA) => {
                if (params.xmlEndPoint === undefined) {
                    const screeningEventIdentifier = createIdentifier({
                        theaterCode: params.locationBranchCode,
                        titleCode: scheduleFromCOA.titleCode,
                        titleBranchNum: scheduleFromCOA.titleBranchNum
                    });

                    // スクリーン存在チェック
                    const screenRoom = <factory.chevre.place.movieTheater.IScreeningRoom | undefined>movieTheater.containsPlace.find(
                        (place) => place.branchCode === scheduleFromCOA.screenCode
                    );
                    if (screenRoom === undefined) {
                        console.error('screenRoom not found.', scheduleFromCOA.screenCode);

                        return;
                    }

                    // 上映イベント取得
                    const screeningEventSeries = screeningEventSerieses.find((event) => event.identifier === screeningEventIdentifier);
                    if (screeningEventSeries === undefined) {
                        console.error('screeningEventSeries not found.', screeningEventIdentifier);

                        return;
                    }

                    // 永続化
                    const screeningEvent = createScreeningEventFromCOA({
                        performanceFromCOA: scheduleFromCOA,
                        screenRoom: screenRoom,
                        screeningEventSeries: screeningEventSeries,
                        serviceKubuns: serviceKubuns,
                        acousticKubuns: acousticKubuns
                    });
                    screeningEvents.push(screeningEvent);
                }
            });

            debug(`storing ${screeningEvents.length} screeningEvents...`);
            await Promise.all(screeningEvents.map(async (screeningEvent) => {
                try {
                    await repos.event.save(screeningEvent);
                } catch (error) {
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore next */
                    console.error(error);
                }
            }));
            debug(`${screeningEvents.length} screeningEvents stored.`);
        }
    };
}

export function createScreeningEventSeriesFromCOA(params: {
    filmFromCOA: COA.services.master.ITitleResult;
    movieTheater: factory.chevre.place.movieTheater.IPlace;
    eirinKubuns: COA.services.master.IKubunNameResult[];
    eizouKubuns: COA.services.master.IKubunNameResult[];
    joueihousikiKubuns: COA.services.master.IKubunNameResult[];
    jimakufukikaeKubuns: COA.services.master.IKubunNameResult[];
}): factory.event.IEvent<factory.chevre.eventType.ScreeningEventSeries> {
    const endDate = (moment(`${params.filmFromCOA.dateEnd} +09:00`, 'YYYYMMDD Z').isValid())
        ? moment(`${params.filmFromCOA.dateEnd} +09:00`, 'YYYYMMDD Z').toDate()
        : undefined;
    const startDate = (moment(`${params.filmFromCOA.dateBegin} +09:00`, 'YYYYMMDD Z').isValid())
        ? moment(`${params.filmFromCOA.dateBegin} +09:00`, 'YYYYMMDD Z').toDate()
        : undefined;
    // title_codeは劇場をまたいで共有、title_branch_numは劇場毎に管理
    const identifier = createIdentifier({
        theaterCode: params.movieTheater.branchCode,
        titleCode: params.filmFromCOA.titleCode,
        titleBranchNum: params.filmFromCOA.titleBranchNum
    });

    return {
        id: identifier,
        identifier: identifier,
        name: {
            ja: params.filmFromCOA.titleName,
            en: params.filmFromCOA.titleNameEng
        },
        kanaName: params.filmFromCOA.titleNameKana,
        alternativeHeadline: {
            ja: params.filmFromCOA.titleNameShort,
            en: ''
        },
        location: {
            id: params.movieTheater.id,
            // identifier: params.movieTheater.identifier,
            branchCode: params.movieTheater.branchCode,
            name: params.movieTheater.name,
            kanaName: params.movieTheater.kanaName,
            typeOf: factory.chevre.placeType.MovieTheater
        },
        // organizer: {
        //     typeOf: factory.organizationType.MovieTheater,
        //     identifier: '',
        //     name: params.movieTheater.name
        // },
        // videoFormat: params.eizouKubuns.filter((kubun) => kubun.kubunCode === params.filmFromCOA.kbnEizou)[0],
        videoFormat: [{ typeOf: factory.chevre.videoFormatType['2D'], name: factory.chevre.videoFormatType['2D'] }],
        soundFormat: [],
        workPerformed: {
            identifier: params.filmFromCOA.titleCode,
            name: params.filmFromCOA.titleNameOrig,
            duration: moment.duration(params.filmFromCOA.showTime, 'm').toISOString(),
            // contentRating: params.eirinKubuns.filter((kubun) => kubun.kubunCode === params.filmFromCOA.kbnEirin)[0],
            typeOf: factory.chevre.creativeWorkType.Movie
        },
        duration: moment.duration(params.filmFromCOA.showTime, 'm').toISOString(),
        endDate: endDate,
        startDate: startDate,
        additionalProperty: [
            {
                name: 'COA_ENDPOINT',
                value: process.env.COA_ENDPOINT
            },
            {
                name: 'coaInfo',
                value: <any>{
                    titleBranchNum: params.filmFromCOA.titleBranchNum,
                    kbnJoueihousiki: params.joueihousikiKubuns.filter((kubun) => kubun.kubunCode === params.filmFromCOA.kbnJoueihousiki)[0],
                    kbnJimakufukikae: params.jimakufukikaeKubuns.filter(
                        (kubun) => kubun.kubunCode === params.filmFromCOA.kbnJimakufukikae
                    )[0],
                    flgMvtkUse: params.filmFromCOA.flgMvtkUse,
                    dateMvtkBegin: params.filmFromCOA.dateMvtkBegin
                }
            }
        ],
        eventStatus: factory.chevre.eventStatusType.EventScheduled,
        typeOf: factory.chevre.eventType.ScreeningEventSeries
    };
}

/**
 * COA情報から上映イベント識別子を作成する
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
export function createIdentifier(params: {
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

export function createMovieTheaterFromCOA(
    theaterFromCOA: COA.services.master.ITheaterResult,
    screensFromCOA: COA.services.master.IScreenResult[]
): factory.chevre.place.movieTheater.IPlace {
    // const identifier = `MovieTheater-${theaterFromCOA.theaterCode}`;
    return {
        id: `COA-${theaterFromCOA.theaterCode}`,
        // identifier: identifier,
        screenCount: screensFromCOA.length,
        branchCode: theaterFromCOA.theaterCode,
        name: {
            ja: theaterFromCOA.theaterName,
            en: theaterFromCOA.theaterNameEng
        },
        kanaName: theaterFromCOA.theaterNameKana,
        containsPlace: screensFromCOA.map((screenFromCOA) => {
            return createScreeningRoomFromCOA(screenFromCOA);
        }),
        typeOf: factory.chevre.placeType.MovieTheater,
        telephone: theaterFromCOA.theaterTelNum
    };
}

/**
 * COAのスクリーン抽出結果から上映室を作成する
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
export function createScreeningRoomFromCOA(
    screenFromCOA: COA.services.master.IScreenResult
): factory.chevre.place.movieTheater.IScreeningRoom {
    const sections: factory.chevre.place.movieTheater.IScreeningRoomSection[] = [];
    const sectionCodes: string[] = [];
    screenFromCOA.listSeat.forEach((seat) => {
        if (sectionCodes.indexOf(seat.seatSection) < 0) {
            sectionCodes.push(seat.seatSection);
            sections.push({
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
            branchCode: seat.seatNum,
            typeOf: factory.chevre.placeType.Seat
        });
    });

    return {
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
 * create individualScreeningEvent from COA performance
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
export function createScreeningEventFromCOA(params: {
    performanceFromCOA: COA.services.master.IScheduleResult;
    screenRoom: factory.chevre.place.movieTheater.IScreeningRoom;
    screeningEventSeries: factory.event.IEvent<factory.chevre.eventType.ScreeningEventSeries>;
    serviceKubuns: COA.services.master.IKubunNameResult[];
    acousticKubuns: COA.services.master.IKubunNameResult[];
}): factory.event.IEvent<factory.chevre.eventType.ScreeningEvent> {
    const identifier = createScreeningEventIdentifierFromCOA({
        theaterCode: params.screeningEventSeries.location.branchCode,
        titleCode: params.performanceFromCOA.titleCode,
        titleBranchNum: params.performanceFromCOA.titleBranchNum,
        dateJouei: params.performanceFromCOA.dateJouei,
        screenCode: params.performanceFromCOA.screenCode,
        timeBegin: params.performanceFromCOA.timeBegin
    });

    // COA情報を整形して開始日時と終了日時を作成
    // tslint:disable-next-line:max-line-length
    const endDate = moment(`${params.performanceFromCOA.dateJouei} ${params.performanceFromCOA.timeEnd} +09:00`, 'YYYYMMDD HHmm Z').toDate();
    // tslint:disable-next-line:max-line-length
    const startDate = moment(`${params.performanceFromCOA.dateJouei} ${params.performanceFromCOA.timeBegin} +09:00`, 'YYYYMMDD HHmm Z').toDate();
    const validFrom = moment(`${params.performanceFromCOA.rsvStartDate} 00:00:00+09:00`, 'YYYYMMDD HH:mm:ssZ').toDate();
    const validThrough = moment(`${params.performanceFromCOA.rsvEndDate} 00:00:00+09:00`, 'YYYYMMDD HH:mm:ssZ').add(1, 'day').toDate();

    const kbnService = params.serviceKubuns.filter((kubun) => kubun.kubunCode === params.performanceFromCOA.kbnService)[0];

    return {
        eventStatus: factory.chevre.eventStatusType.EventScheduled,
        typeOf: factory.chevre.eventType.ScreeningEvent,
        id: identifier,
        identifier: identifier,
        name: params.screeningEventSeries.name,
        workPerformed: params.screeningEventSeries.workPerformed,
        location: {
            typeOf: factory.chevre.placeType.ScreeningRoom,
            branchCode: params.screenRoom.branchCode,
            name: params.screenRoom.name
        },
        doorTime: startDate,
        endDate: endDate,
        startDate: startDate,
        superEvent: params.screeningEventSeries,
        offers: {
            id: kbnService.kubunCode,
            name: {
                ja: kbnService.kubunName,
                en: kbnService.kubunNameEng
            },
            typeOf: 'Offer',
            priceCurrency: factory.priceCurrency.JPY,
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
                serviceType: {
                    typeOf: 'ServiceType',
                    id: kbnService.kubunCode,
                    name: kbnService.kubunName
                }
            },
            offeredThrough: { typeOf: 'WebAPI', identifier: factory.service.webAPI.Identifier.COA }
        },
        checkInCount: 0,
        attendeeCount: 0,
        maximumAttendeeCapacity: params.screenRoom.maximumAttendeeCapacity,
        remainingAttendeeCapacity: params.screenRoom.maximumAttendeeCapacity,
        additionalProperty: [
            {
                name: 'COA_ENDPOINT',
                value: process.env.COA_ENDPOINT
            },
            {
                name: 'coaInfo',
                value: <any>{
                    theaterCode: params.screeningEventSeries.location.branchCode,
                    dateJouei: params.performanceFromCOA.dateJouei,
                    titleCode: params.performanceFromCOA.titleCode,
                    titleBranchNum: params.performanceFromCOA.titleBranchNum,
                    timeBegin: params.performanceFromCOA.timeBegin,
                    screenCode: params.performanceFromCOA.screenCode,
                    trailerTime: params.performanceFromCOA.trailerTime,
                    kbnService: params.serviceKubuns.filter((kubun) => kubun.kubunCode === params.performanceFromCOA.kbnService)[0],
                    kbnAcoustic: params.acousticKubuns.filter((kubun) => kubun.kubunCode === params.performanceFromCOA.kbnAcoustic)[0],
                    nameServiceDay: params.performanceFromCOA.nameServiceDay,
                    availableNum: params.performanceFromCOA.availableNum,
                    rsvStartDate: params.performanceFromCOA.rsvStartDate,
                    rsvEndDate: params.performanceFromCOA.rsvEndDate,
                    flgEarlyBooking: params.performanceFromCOA.flgEarlyBooking
                }
            }
        ]
    };
}

/**
 * COA情報から個々の上映イベント識別子を作成する
 */
// tslint:disable-next-line:no-single-line-block-comment
/* istanbul ignore next */
export function createScreeningEventIdentifierFromCOA(params: {
    theaterCode: string;
    titleCode: string;
    titleBranchNum: string;
    dateJouei: string;
    screenCode: string;
    timeBegin: string;
}): string {
    return [
        createIdentifier(params),
        params.dateJouei,
        params.screenCode,
        params.timeBegin
    ].join('');
}

/**
 * Googleで作品画像を検索する
 */
export async function findMovieImage(params: {
    query: string;
}) {
    return new Promise<string | undefined>((resolve) => {
        customsearch.cse.list(
            {
                cx: <string>process.env.CUSTOM_SEARCH_ENGINE_ID,
                q: params.query,
                auth: <string>process.env.GOOGLE_API_KEY,
                num: 1,
                rights: 'cc_publicdomain cc_sharealike',
                // start: 0,
                // imgSize: 'medium',
                searchType: 'image'
            },
            (err: any, res: any) => {
                if (!(err instanceof Error)) {
                    if (typeof res.data === 'object' && Array.isArray(res.data.items) && res.data.items.length > 0) {
                        debug('custome search result:', res.data);
                        resolve(<string>res.data.items[0].image.thumbnailLink);
                        // resolve(<string>res.data.items[0].link);

                        return;
                        // thumbnails.push({
                        //     eventId: event.id,
                        //     link: res.data.items[0].link,
                        //     thumbnailLink: res.data.items[0].image.thumbnailLink
                        // });
                    }
                }

                resolve(undefined);
            }
        );
    });
}

/**
 * 座席仮予約キャンセル
 */
export function cancelSeatReservationAuth(params: { transactionId: string }) {
    return async (repos: {
        action: ActionRepo;
        reserveService: chevre.service.transaction.Reserve;
    }) => {
        // 座席仮予約アクションを取得
        const authorizeActions = <factory.action.authorize.offer.seatReservation.IAction<factory.service.webAPI.Identifier>[]>
            await repos.action.findAuthorizeByTransactionId(params).then((actions) => actions
                .filter((a) => a.object.typeOf === factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation)
            );
        await Promise.all(authorizeActions.map(async (action) => {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (action.result !== undefined) {
                const requestBody = action.result.requestBody;
                let responseBody = action.result.responseBody;

                if (action.instrument === undefined) {
                    action.instrument = {
                        typeOf: 'WebAPI',
                        identifier: factory.service.webAPI.Identifier.Chevre
                    };
                }

                switch (action.instrument.identifier) {
                    case factory.service.webAPI.Identifier.COA:
                        // tslint:disable-next-line:max-line-length
                        responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.COA>>responseBody;

                        // tslint:disable-next-line:no-suspicious-comment
                        // COAで仮予約取消
                        const updTmpReserveSeatArgs = requestBody;
                        const updTmpReserveSeatResult = responseBody;

                        await COA.services.reserve.delTmpReserve({
                            theaterCode: updTmpReserveSeatArgs.theaterCode,
                            dateJouei: updTmpReserveSeatArgs.dateJouei,
                            titleCode: updTmpReserveSeatArgs.titleCode,
                            titleBranchNum: updTmpReserveSeatArgs.titleBranchNum,
                            timeBegin: updTmpReserveSeatArgs.timeBegin,
                            tmpReserveNum: updTmpReserveSeatResult.tmpReserveNum
                        });

                        break;

                    default:
                        // tslint:disable-next-line:max-line-length
                        responseBody = <factory.action.authorize.offer.seatReservation.IResponseBody<factory.service.webAPI.Identifier.Chevre>>responseBody;

                        // すでに取消済であったとしても、すべて取消処理(actionStatusに関係なく)
                        debug('calling reserve transaction...');
                        await repos.reserveService.cancel({ id: responseBody.id });
                        await repos.action.cancel({ typeOf: action.typeOf, id: action.id });
                }
            }
        }));
    };
}
