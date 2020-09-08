import * as mvtkapi from '@movieticket/reserve-api-nodejs-client';
import * as createDebug from 'debug';
import * as moment from 'moment-timezone';

import * as factory from '../../factory';

const debug = createDebug('cinerino-domain:repository');
export type IMovieTicket = factory.chevre.paymentMethod.paymentCard.movieTicket.IMovieTicket;
export interface IOptions {
    endpoint: string;
    auth: mvtkapi.auth.ClientCredentials;
}
export interface ICheckResult {
    purchaseNumberAuthIn: factory.action.check.paymentMethod.movieTicket.IPurchaseNumberAuthIn;
    purchaseNumberAuthResult: factory.action.check.paymentMethod.movieTicket.IPurchaseNumberAuthResult;
    movieTickets: IMovieTicket[];
}

/**
 * ムビチケリポジトリ
 */
export class MvtkRepository {
    public readonly options: IOptions;

    constructor(options: IOptions) {
        this.options = options;
    }

    /**
     * ムビチケ認証
     */
    // tslint:disable-next-line:max-func-body-length
    public async checkByIdentifier(params: {
        movieTickets: IMovieTicket[];
        movieTicketPaymentAccepted: factory.seller.IPaymentAccepted;
        screeningEvent: factory.event.IEvent<factory.chevre.eventType.ScreeningEvent>;
    }): Promise<ICheckResult> {
        const movieTickets: factory.action.check.paymentMethod.movieTicket.IMovieTicketResult[] = [];
        let purchaseNumberAuthIn: factory.action.check.paymentMethod.movieTicket.IPurchaseNumberAuthIn;
        let purchaseNumberAuthResult: factory.action.check.paymentMethod.movieTicket.IPurchaseNumberAuthResult;

        const movieTicketIdentifiers: string[] = [];
        const knyknrNoInfoIn: mvtkapi.mvtk.services.auth.purchaseNumberAuth.IKnyknrNoInfoIn[] = [];
        params.movieTickets.forEach((movieTicket) => {
            if (movieTicketIdentifiers.indexOf(movieTicket.identifier) < 0) {
                movieTicketIdentifiers.push(movieTicket.identifier);
                knyknrNoInfoIn.push({
                    knyknrNo: movieTicket.identifier,
                    pinCd: movieTicket.accessCode
                });
            }
        });

        // ムビチケ、MGチケット等、指定された決済方法タイプ
        const paymentMethodType = params.movieTickets[0]?.typeOf;
        if (typeof paymentMethodType !== 'string') {
            throw new factory.errors.ArgumentNull('movieTickets.typeOf');
        }

        let skhnCd = params.screeningEvent.superEvent.workPerformed.identifier;

        const eventOffers = params.screeningEvent.offers;
        if (eventOffers === undefined) {
            throw new factory.errors.NotFound('EventOffers', 'Event offers undefined');
        }

        const offeredThrough = eventOffers.offeredThrough;
        // イベントインポート元がCOAの場合、作品コード連携方法が異なる
        if (offeredThrough !== undefined && offeredThrough.identifier === factory.service.webAPI.Identifier.COA) {
            const DIGITS = -2;
            let eventCOAInfo: any;
            if (Array.isArray(params.screeningEvent.additionalProperty)) {
                const coaInfoProperty = params.screeningEvent.additionalProperty.find((p) => p.name === 'coaInfo');
                eventCOAInfo = (coaInfoProperty !== undefined) ? JSON.parse(coaInfoProperty.value) : undefined;
            }
            skhnCd = `${eventCOAInfo.titleCode}${`00${eventCOAInfo.titleBranchNum}`.slice(DIGITS)}`;
        }

        purchaseNumberAuthIn = {
            kgygishCd: <string>params.movieTicketPaymentAccepted.movieTicketInfo?.kgygishCd,
            jhshbtsCd: mvtkapi.mvtk.services.auth.purchaseNumberAuth.InformationTypeCode.All,
            knyknrNoInfoIn: knyknrNoInfoIn,
            skhnCd: skhnCd,
            stCd: <string>params.movieTicketPaymentAccepted.movieTicketInfo?.stCd,
            jeiYmd: moment(params.screeningEvent.startDate)
                .tz('Asia/Tokyo')
                .format('YYYY/MM/DD')
        };

        const authService = new mvtkapi.service.Auth(this.options);
        purchaseNumberAuthResult = await authService.purchaseNumberAuth(purchaseNumberAuthIn);
        debug('purchaseNumberAuthResult:', purchaseNumberAuthResult);

        // ムビチケ配列に成形
        if (Array.isArray(purchaseNumberAuthResult.knyknrNoInfoOut)) {
            purchaseNumberAuthResult.knyknrNoInfoOut.forEach((knyknrNoInfoOut) => {
                const knyknrNoInfo = knyknrNoInfoIn.find((info) => info.knyknrNo === knyknrNoInfoOut.knyknrNo);
                if (knyknrNoInfo !== undefined) {
                    if (Array.isArray(knyknrNoInfoOut.ykknInfo)) {
                        knyknrNoInfoOut.ykknInfo.forEach((ykknInfo) => {
                            // tslint:disable-next-line:prefer-array-literal
                            [...Array(Number(ykknInfo.ykknKnshbtsmiNum))].forEach(() => {
                                movieTickets.push({
                                    project: { typeOf: factory.organizationType.Project, id: params.screeningEvent.project.id },
                                    typeOf: paymentMethodType,
                                    identifier: knyknrNoInfo.knyknrNo,
                                    accessCode: knyknrNoInfo.pinCd,
                                    serviceType: ykknInfo.ykknshTyp,
                                    serviceOutput: {
                                        reservationFor: {
                                            typeOf: params.screeningEvent.typeOf,
                                            id: params.screeningEvent.id
                                        },
                                        reservedTicket: {
                                            ticketedSeat: {
                                                typeOf: factory.chevre.placeType.Seat,
                                                // seatingType: 'Default', // 情報空でよし
                                                seatNumber: '', // 情報空でよし
                                                seatRow: '', // 情報空でよし
                                                seatSection: '' // 情報空でよし
                                            }
                                        }
                                    }
                                });
                            });
                        });
                    }
                    if (Array.isArray(knyknrNoInfoOut.mkknInfo)) {
                        knyknrNoInfoOut.mkknInfo.forEach((mkknInfo) => {
                            // tslint:disable-next-line:prefer-array-literal
                            [...Array(Number(mkknInfo.mkknKnshbtsmiNum))].forEach(() => {
                                movieTickets.push({
                                    project: { typeOf: factory.organizationType.Project, id: params.screeningEvent.project.id },
                                    typeOf: paymentMethodType,
                                    identifier: knyknrNoInfo.knyknrNo,
                                    accessCode: knyknrNoInfo.pinCd,
                                    amount: {
                                        typeOf: <'MonetaryAmount'>'MonetaryAmount',
                                        currency: factory.priceCurrency.JPY,
                                        validThrough: moment(`${mkknInfo.yykDt}+09:00`, 'YYYY/MM/DD HH:mm:ssZ')
                                            .toDate()

                                    },
                                    serviceType: mkknInfo.mkknshTyp,
                                    serviceOutput: {
                                        reservationFor: {
                                            typeOf: params.screeningEvent.typeOf,
                                            id: params.screeningEvent.id
                                        },
                                        reservedTicket: {
                                            ticketedSeat: {
                                                typeOf: factory.chevre.placeType.Seat,
                                                // seatingType: 'Default', // 情報空でよし
                                                seatNumber: '', // 情報空でよし
                                                seatRow: '', // 情報空でよし
                                                seatSection: '' // 情報空でよし
                                            }
                                        }
                                    },
                                    ...{
                                        validThrough: moment(`${mkknInfo.yykDt}+09:00`, 'YYYY/MM/DD HH:mm:ssZ')
                                            .toDate()
                                    }
                                });
                            });
                        });
                    }
                }
            });
        }

        return { purchaseNumberAuthIn, purchaseNumberAuthResult, movieTickets };
    }
}
