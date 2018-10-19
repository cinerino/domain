import * as mvtkapi from '@movieticket/reserve-api-nodejs-client';
import * as createDebug from 'debug';
import * as moment from 'moment-timezone';

import * as factory from '../../factory';

const debug = createDebug('cinerino-domain:repository');
export type IMovieTicket = factory.paymentMethod.paymentCard.movieTicket.IMovieTicket;
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
 * ムビチケリポジトリー
 */
export class MvtkRepository {
    public readonly options: IOptions;

    constructor(options: IOptions) {
        this.options = options;
    }

    /**
     * ムビチケ認証
     */
    public async checkByIdentifier(params: {
        movieTickets: IMovieTicket[];
        movieTicketPaymentAccepted: factory.organization.IPaymentAccepted<factory.paymentMethodType.MovieTicket>;
        screeningEvent: factory.chevre.event.screeningEvent.IEvent;
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
        purchaseNumberAuthIn = {
            kgygishCd: params.movieTicketPaymentAccepted.movieTicketInfo.kgygishCd,
            jhshbtsCd: mvtkapi.mvtk.services.auth.purchaseNumberAuth.InformationTypeCode.All,
            knyknrNoInfoIn: knyknrNoInfoIn,
            skhnCd: params.screeningEvent.superEvent.workPerformed.identifier,
            stCd: params.movieTicketPaymentAccepted.movieTicketInfo.stCd,
            jeiYmd: moment(params.screeningEvent.startDate).tz('Asia/Tokyo').format('YYYY/MM/DD')
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
                            [...Array(Number(ykknInfo.ykknKnshbtsmiNum))].forEach(() => {
                                movieTickets.push({
                                    typeOf: factory.paymentMethodType.MovieTicket,
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
                                                seatingType: '', // 情報空でよし
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
                            [...Array(Number(mkknInfo.mkknKnshbtsmiNum))].forEach(() => {
                                movieTickets.push({
                                    typeOf: factory.paymentMethodType.MovieTicket,
                                    identifier: knyknrNoInfo.knyknrNo,
                                    accessCode: knyknrNoInfo.pinCd,
                                    serviceType: mkknInfo.mkknshTyp,
                                    serviceOutput: {
                                        reservationFor: {
                                            typeOf: params.screeningEvent.typeOf,
                                            id: params.screeningEvent.id
                                        },
                                        reservedTicket: {
                                            ticketedSeat: {
                                                typeOf: factory.chevre.placeType.Seat,
                                                seatingType: '', // 情報空でよし
                                                seatNumber: '', // 情報空でよし
                                                seatRow: '', // 情報空でよし
                                                seatSection: '' // 情報空でよし
                                            }
                                        }
                                    },
                                    validThrough: moment(`${mkknInfo.yykDt}+09:00`, 'YYYY/MM/DD HH:mm:ssZ').toDate()
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
