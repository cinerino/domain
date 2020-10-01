
import * as factory from '../../../factory';

export type IStartParams = factory.transaction.placeOrder.IStartParamsWithoutDetail;

export function createAttributes(
    params: IStartParams,
    passport: factory.waiter.passport.IPassport | undefined,
    informOrderParams: factory.transaction.placeOrder.IInformOrderParams[],
    seller: factory.seller.ISeller
): factory.transaction.placeOrder.IAttributes {
    const transactionObject: factory.transaction.placeOrder.IObject = {
        passportToken: (typeof params.object.passport?.token === 'string') ? params.object.passport.token : undefined,
        passport: passport,
        authorizeActions: [],
        onOrderStatusChanged: {
            informOrder: informOrderParams
        },
        ...((<any>params.object).clientUser !== undefined && (<any>params.object).clientUser !== null)
            ? { clientUser: (<any>params.object).clientUser }
            : undefined,
        ...(typeof params.object?.name === 'string') ? { name: params.object?.name } : undefined
    };

    // 取引ファクトリーで新しい進行中取引オブジェクトを作成
    return {
        project: { typeOf: seller.project.typeOf, id: seller.project.id },
        typeOf: factory.transactionType.PlaceOrder,
        status: factory.transactionStatusType.InProgress,
        agent: params.agent,
        seller: {
            project: seller.project,
            id: seller.id,
            name: seller.name,
            typeOf: seller.typeOf,
            ...(typeof seller.telephone === 'string') ? { telephone: seller.telephone } : undefined,
            ...(typeof seller.url === 'string') ? { url: seller.url } : undefined,
            ...(typeof seller.image === 'string') ? { image: seller.image } : undefined
        },
        object: transactionObject,
        expires: params.expires,
        startDate: new Date(),
        tasksExportationStatus: factory.transactionTasksExportationStatus.Unexported
    };
}
