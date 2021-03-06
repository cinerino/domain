/**
 * プロダクトサービスファクトリー
 */
import * as factory from '../../factory';

export function createOrderProgramMembershipActionAttributes(params: {
    agent: factory.person.IPerson;
    offer: factory.offer.IOffer;
    product: factory.chevre.product.IProduct;
    seller: factory.seller.ISeller;
}): factory.task.IData<factory.taskName.OrderProgramMembership> {
    const offer = params.offer;
    const seller = params.seller;

    const serviceOutputType = params.product.serviceOutput?.typeOf;
    if (typeof serviceOutputType !== 'string') {
        throw new factory.errors.NotFound(`ServiceOutput for product ${params.product.id}`);
    }

    const itemOffered: factory.programMembership.IProgramMembership = {
        project: { typeOf: factory.chevre.organizationType.Project, id: params.product.project.id },
        typeOf: <any>serviceOutputType,
        name: <any>params.product.name,
        // メンバーシップのホスト組織確定(この組織が決済対象となる)
        hostingOrganization: {
            // project: { typeOf: factory.chevre.organizationType.Project, id: seller.project.id },
            id: seller.id,
            typeOf: seller.typeOf
        },
        membershipFor: {
            typeOf: factory.chevre.product.ProductType.MembershipService,
            id: <string>params.product.id
        }
    };

    // 受け入れれたオファーオブジェクトを作成
    const acceptedOffer: factory.order.IAcceptedOffer<factory.programMembership.IProgramMembership> = {
        project: { typeOf: seller.project.typeOf, id: seller.project.typeOf },
        typeOf: factory.chevre.offerType.Offer,
        identifier: offer.identifier,
        priceCurrency: offer.priceCurrency,
        priceSpecification: offer.priceSpecification,
        itemOffered: itemOffered,
        seller: {
            project: { typeOf: seller.project.typeOf, id: seller.project.typeOf },
            typeOf: seller.typeOf,
            id: seller.id,
            name: (typeof seller.name === 'string')
                ? seller.name
                : String(seller.name?.ja)
        }
    };

    return {
        // 最低限の情報のみagentに設定
        agent: {
            typeOf: params.agent.typeOf,
            id: params.agent.id,
            // paramsにadditionalPropertyの指定があれば反映する
            ...(Array.isArray(params.agent.additionalProperty)) ? { additionalProperty: params.agent.additionalProperty } : []
        },
        object: acceptedOffer,
        project: { typeOf: factory.chevre.organizationType.Project, id: params.product.project.id },
        typeOf: factory.actionType.OrderAction
    };
}
