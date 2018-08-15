/**
 * 会員クレジットカードサービス
 */
import * as factory from '@cinerino/factory';
import * as GMO from '@motionpicture/gmo-service';
import * as createDebug from 'debug';

const debug = createDebug('cinerino-domain:*');

export type IOperation<T> = () => Promise<T>;
export type IUncheckedCardRaw = factory.paymentMethod.paymentCard.creditCard.IUncheckedCardRaw;
export type IUncheckedCardTokenized = factory.paymentMethod.paymentCard.creditCard.IUncheckedCardTokenized;

/**
 * クレジットカード追加
 */
export function save(
    personId: string,
    creditCard: IUncheckedCardRaw | IUncheckedCardTokenized,
    defaultFlag?: boolean
): IOperation<GMO.services.card.ISearchCardResult> {
    return async () => {
        // GMOカード登録
        let addedCreditCard: GMO.services.card.ISearchCardResult;
        try {
            // まずGMO会員登録
            const memberId = personId;
            const memberName = personId;
            try {
                await GMO.services.card.searchMember({
                    siteId: <string>process.env.GMO_SITE_ID,
                    sitePass: <string>process.env.GMO_SITE_PASS,
                    memberId: memberId
                });
            } catch (searchMemberError) {
                // 会員が存在しない場合このエラーになる
                if (Array.isArray(searchMemberError.errors) &&
                    searchMemberError.errors.length === 1 &&
                    searchMemberError.errors[0].info === 'E01390002') {
                    const saveMemberResult = await GMO.services.card.saveMember({
                        siteId: <string>process.env.GMO_SITE_ID,
                        sitePass: <string>process.env.GMO_SITE_PASS,
                        memberId: memberId,
                        memberName: memberName
                    });
                    debug('GMO saveMember processed', saveMemberResult);
                } else {
                    throw searchMemberError;
                }
            }

            debug('saving a card to GMO...');
            const saveCardResult = await GMO.services.card.saveCard({
                siteId: <string>process.env.GMO_SITE_ID,
                sitePass: <string>process.env.GMO_SITE_PASS,
                memberId: memberId,
                seqMode: GMO.utils.util.SeqMode.Physics,
                cardNo: (<IUncheckedCardRaw>creditCard).cardNo,
                cardPass: (<IUncheckedCardRaw>creditCard).cardPass,
                expire: (<IUncheckedCardRaw>creditCard).expire,
                holderName: (<IUncheckedCardRaw>creditCard).holderName,
                token: (<IUncheckedCardTokenized>creditCard).token,
                // tslint:disable-next-line:no-single-line-block-comment
                defaultFlag: (defaultFlag === true) ? /* istanbul ignore next */ '1' : '0'
            });
            debug('card saved', saveCardResult);

            const searchCardResults = await GMO.services.card.searchCard({
                siteId: <string>process.env.GMO_SITE_ID,
                sitePass: <string>process.env.GMO_SITE_PASS,
                memberId: memberId,
                seqMode: GMO.utils.util.SeqMode.Physics,
                cardSeq: saveCardResult.cardSeq
            });

            addedCreditCard = searchCardResults[0];
        } catch (error) {
            if (error.name === 'GMOServiceBadRequestError') {
                throw new factory.errors.Argument('creditCard', error.errors[0].content);
            } else {
                throw error;
            }
        }

        return addedCreditCard;
    };
}

/**
 * クレジットカード削除
 */
export function unsubscribe(personId: string, cardSeq: string): IOperation<void> {
    return async () => {
        try {
            // GMOからカード削除
            const memberId = personId;
            const deleteCardResult = await GMO.services.card.deleteCard({
                siteId: <string>process.env.GMO_SITE_ID,
                sitePass: <string>process.env.GMO_SITE_PASS,
                memberId: memberId,
                seqMode: GMO.utils.util.SeqMode.Physics,
                cardSeq: cardSeq
            });
            debug('credit card deleted', deleteCardResult);
        } catch (error) {
            if (error.name === 'GMOServiceBadRequestError') {
                throw new factory.errors.Argument('cardSeq', error.errors[0].content);
            } else {
                throw error;
            }
        }
    };
}

/**
 * クレジットカード検索
 */
export function find(
    personId: string
): IOperation<GMO.services.card.ISearchCardResult[]> {
    return async () => {
        let creditCards: GMO.services.card.ISearchCardResult[] = [];
        try {
            // まずGMO会員登録
            const memberId = personId;
            const memberName = personId;
            try {
                await GMO.services.card.searchMember({
                    siteId: <string>process.env.GMO_SITE_ID,
                    sitePass: <string>process.env.GMO_SITE_PASS,
                    memberId: memberId
                });
            } catch (searchMemberError) {
                // 会員が存在しない場合このエラーになる
                if (Array.isArray(searchMemberError.errors) &&
                    searchMemberError.errors.length === 1 &&
                    searchMemberError.errors[0].info === 'E01390002') {
                    const saveMemberResult = await GMO.services.card.saveMember({
                        siteId: <string>process.env.GMO_SITE_ID,
                        sitePass: <string>process.env.GMO_SITE_PASS,
                        memberId: memberId,
                        memberName: memberName
                    });
                    debug('GMO saveMember processed', saveMemberResult);
                } else {
                    throw searchMemberError;
                }
            }

            creditCards = await GMO.services.card.searchCard({
                siteId: <string>process.env.GMO_SITE_ID,
                sitePass: <string>process.env.GMO_SITE_PASS,
                memberId: memberId,
                seqMode: GMO.utils.util.SeqMode.Physics
                // 未削除のものに絞り込む
            }).then((results) => results.filter((result) => result.deleteFlag === '0'));
        } catch (error) {
            debug(error);
            if (error.name === 'GMOServiceBadRequestError') {
                // カードが存在しない場合このエラーになる
                // ErrCode=E01&ErrInfo=E01240002
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore if: please write tests */
                if (Array.isArray(error.errors) &&
                    error.errors.length === 1 &&
                    error.errors[0].info === 'E01240002') {
                    // no op
                    // 存在しないだけなので何もしない
                } else {
                    throw new factory.errors.Argument('personId', error.errors[0].content);
                }
            } else {
                throw error;
            }
        }

        return creditCards;
    };
}
