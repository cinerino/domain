import * as GMO from '@motionpicture/gmo-service';

import * as factory from '../../factory';

export type IUncheckedCardRaw = factory.chevre.paymentMethod.paymentCard.creditCard.IUncheckedCardRaw;
export type IUncheckedCardTokenized = factory.chevre.paymentMethod.paymentCard.creditCard.IUncheckedCardTokenized;
export type ISearchCardResult = GMO.factory.card.ISearchCardResult;

export interface IOptions {
    /**
     * GMOサイトID
     */
    siteId: string;
    /**
     * GMOサイトパス
     */
    sitePass: string;
    /**
     * GMOクレジットカードサービス
     */
    cardService: GMO.service.Card;
}

/**
 * クレジットカードリポジトリ
 */
export class GMORepository {
    public readonly options: IOptions;

    constructor(options: IOptions) {
        this.options = options;
    }

    /**
     * クレジットカード追加
     */
    public async save(params: {
        /**
         * 会員ID
         */
        personId: string;
        creditCard: IUncheckedCardRaw | IUncheckedCardTokenized;
        defaultFlag?: boolean;
    }): Promise<ISearchCardResult> {
        let addedCreditCard: ISearchCardResult;
        const memberId = params.personId;
        const memberName = params.personId;

        try {
            // まずGMO会員登録
            try {
                await this.options.cardService.searchMember({
                    siteId: this.options.siteId,
                    sitePass: this.options.sitePass,
                    memberId: memberId
                });
            } catch (searchMemberError) {
                // 会員が存在しない場合このエラーになる
                if (Array.isArray(searchMemberError.errors) &&
                    searchMemberError.errors.length === 1 &&
                    searchMemberError.errors[0].info === 'E01390002') {
                    await this.options.cardService.saveMember({
                        siteId: this.options.siteId,
                        sitePass: this.options.sitePass,
                        memberId: memberId,
                        memberName: memberName
                    });
                } else {
                    throw searchMemberError;
                }
            }

            const saveCardResult = await this.options.cardService.saveCard({
                siteId: this.options.siteId,
                sitePass: this.options.sitePass,
                memberId: memberId,
                seqMode: GMO.utils.util.SeqMode.Physics,
                cardNo: (<IUncheckedCardRaw>params.creditCard).cardNo,
                cardPass: (<IUncheckedCardRaw>params.creditCard).cardPass,
                expire: (<IUncheckedCardRaw>params.creditCard).expire,
                holderName: (<IUncheckedCardRaw>params.creditCard).holderName,
                token: (<IUncheckedCardTokenized>params.creditCard).token,
                // tslint:disable-next-line:no-single-line-block-comment
                defaultFlag: (params.defaultFlag === true) ? /* istanbul ignore next */ '1' : '0'
            });

            const searchCardResults = await this.options.cardService.searchCard({
                siteId: this.options.siteId,
                sitePass: this.options.sitePass,
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
    }

    /**
     * クレジットカード削除
     */
    public async deleteBySequenceNumber(params: {
        /**
         * 会員ID
         */
        personId: string;
        cardSeq: string;
    }): Promise<void> {
        const memberId = params.personId;

        try {
            // GMOからカード削除
            await this.options.cardService.deleteCard({
                siteId: this.options.siteId,
                sitePass: this.options.sitePass,
                memberId: memberId,
                seqMode: GMO.utils.util.SeqMode.Physics,
                cardSeq: params.cardSeq
            });
        } catch (error) {
            if (error.name === 'GMOServiceBadRequestError') {
                throw new factory.errors.Argument('cardSeq', error.errors[0].content);
            } else {
                throw error;
            }
        }
    }

    /**
     * 会員のクレジットカードを全て削除
     */
    public async deleteAll(params: {
        /**
         * 会員ID
         */
        personId: string;
    }): Promise<void> {
        const memberId = params.personId;
        let searchResult: GMO.factory.card.ISearchMemberResult | undefined;

        try {
            try {
                searchResult = await this.options.cardService.searchMember({
                    siteId: this.options.siteId,
                    sitePass: this.options.sitePass,
                    memberId: memberId
                });
            } catch (searchMemberError) {
                // 会員が存在しない場合このエラーになる
                if (Array.isArray(searchMemberError.errors) &&
                    searchMemberError.errors.length === 1 &&
                    searchMemberError.errors[0].info === 'E01390002') {
                    // すでに存在しなければok
                } else {
                    throw searchMemberError;
                }
            }

            if (searchResult !== undefined) {
                // GMOから会員削除
                await this.options.cardService.deleteMember({
                    siteId: this.options.siteId,
                    sitePass: this.options.sitePass,
                    memberId: memberId
                });
            }
        } catch (error) {
            if (error.name === 'GMOServiceBadRequestError') {
                throw new factory.errors.Argument('cardSeq', error.errors[0].content);
            } else {
                throw error;
            }
        }
    }

    /**
     * クレジットカード検索
     */
    public async search(params: {
        /**
         * 会員ID
         */
        personId: string;
    }): Promise<ISearchCardResult[]> {
        let creditCards: ISearchCardResult[] = [];
        try {
            const memberId = params.personId;
            // const memberName = params.personId;
            let searchMemberResult: GMO.factory.card.ISearchMemberResult | undefined;

            try {
                // まずGMO会員存在確認
                searchMemberResult = await this.options.cardService.searchMember({
                    siteId: this.options.siteId,
                    sitePass: this.options.sitePass,
                    memberId: memberId
                });
            } catch (searchMemberError) {
                // 会員が存在しない場合このエラーになる
                if (Array.isArray(searchMemberError.errors) &&
                    searchMemberError.errors.length === 1 &&
                    searchMemberError.errors[0].info === 'E01390002') {
                    // 存在しなければカードなし
                } else {
                    throw searchMemberError;
                }
            }

            // 会員が存在していればカード検索
            if (searchMemberResult !== undefined) {
                creditCards = await this.options.cardService.searchCard({
                    siteId: this.options.siteId,
                    sitePass: this.options.sitePass,
                    memberId: memberId,
                    seqMode: GMO.utils.util.SeqMode.Physics
                    // 未削除のものに絞り込む
                })
                    .then((results) => results.filter((result) => result.deleteFlag === '0'));
            }
        } catch (error) {
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
    }
}
