import * as moment from 'moment';

import * as factory from '../../../../factory';

import { availableProductTypes, ProductType } from '../../../offer/product/factory';

export async function createRegisterServiceActions(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
}): Promise<factory.action.IAttributes<factory.actionType.RegisterAction, any, any>[]> {
    const registerServiceActions: factory.action.IAttributes<factory.actionType.RegisterAction, any, any>[] = [];

    const authorizeProductOfferActions = (<factory.action.authorize.offer.product.IAction[]>
        params.transaction.object.authorizeActions)
        .filter((a) => a.actionStatus === factory.actionStatusType.CompletedActionStatus)
        .filter((a) =>
            Array.isArray(a.object)
            && a.object.length > 0
            && a.object[0].typeOf === factory.chevre.offerType.Offer
            && availableProductTypes.indexOf(a.object[0].itemOffered.typeOf) >= 0
        );

    authorizeProductOfferActions.forEach((a) => {
        const actionResult = a.result;

        if (actionResult !== undefined) {
            // const requestBody = actionResult.requestBody;
            // const registerServiceTransaction = (<any>actionResult).responseBody;

            const registerServiceObject = createRegisterServiceActionObject({
                order: params.order,
                potentialActions: params.potentialActions,
                transaction: params.transaction,
                transactionNumber: a.instrument?.transactionNumber
            });

            const orderProgramMembershipTask = createOrderProgramMembershipTask({
                order: params.order,
                transaction: params.transaction,
                authorizeAction: a
            });

            registerServiceActions.push({
                project: params.transaction.project,
                typeOf: <factory.actionType.RegisterAction>factory.actionType.RegisterAction,
                object: registerServiceObject,
                agent: params.transaction.agent,
                purpose: <any>{
                    project: params.order.project,
                    typeOf: params.order.typeOf,
                    seller: params.order.seller,
                    customer: params.order.customer,
                    confirmationNumber: params.order.confirmationNumber,
                    orderNumber: params.order.orderNumber,
                    price: params.order.price,
                    priceCurrency: params.order.priceCurrency,
                    orderDate: params.order.orderDate
                },
                potentialActions: {
                    ...(orderProgramMembershipTask !== undefined)
                        ? { orderProgramMembership: [orderProgramMembershipTask] }
                        : undefined
                }
            });
        }
    });

    return registerServiceActions;
}

function createRegisterServiceActionObject(params: {
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
    transaction: factory.transaction.placeOrder.ITransaction;
    // registerServiceTransaction: any;
    transactionNumber?: string;
}): factory.chevre.transaction.registerService.IConfirmParams {
    return {
        // id: params.registerServiceTransaction.id,
        transactionNumber: params.transactionNumber,
        endDate: params.order.orderDate,
        object: {
        },
        ...{
            typeOf: factory.chevre.transactionType.RegisterService
        }
        // potentialActions?: IPotentialActionsParams;
    };
}

/**
 * ssktsへの互換性対応として
 * 次回メンバーシップ注文タスクを作成する
 */
function createOrderProgramMembershipTask(params: {
    order: factory.order.IOrder;
    transaction: factory.transaction.placeOrder.ITransaction;
    authorizeAction: factory.action.authorize.offer.product.IAction;
}): factory.task.IAttributes<factory.taskName.OrderProgramMembership> | undefined {
    let orderMembershipTask: factory.task.IAttributes<factory.taskName.OrderProgramMembership> | undefined;

    const acceptedOffer = params.authorizeAction.object[0];

    // ssktsへの互換性対応なので、限定的に
    const serviceOutput = acceptedOffer.itemOffered.serviceOutput;
    if (acceptedOffer.itemOffered.typeOf === ProductType.MembershipService
        && serviceOutput?.typeOf === factory.chevre.programMembership.ProgramMembershipType.ProgramMembership) {
        const memebershipFor = {
            typeOf: String(acceptedOffer.itemOffered.typeOf),
            id: String(acceptedOffer.itemOffered.id)
        };

        // 次回のメンバーシップ注文タスクを生成
        const orderProgramMembershipTaskData: factory.task.IData<factory.taskName.OrderProgramMembership> = {
            agent: params.transaction.agent,
            object: {
                ...acceptedOffer,
                itemOffered: {
                    project: { typeOf: 'Project', id: params.order.project.id },
                    typeOf: serviceOutput?.typeOf,
                    name: serviceOutput.name,
                    hostingOrganization: serviceOutput.issuedBy,
                    membershipFor: memebershipFor,
                    ...{
                        issuedThrough: memebershipFor
                    }
                }
            },
            // potentialActions: updateProgramMembershipPotentialActions,
            project: params.order.project,
            typeOf: factory.actionType.OrderAction
        };

        // どういう期間でいくらのオファーなのか
        const priceSpec = <factory.chevre.compoundPriceSpecification.IPriceSpecification<any>>
            acceptedOffer.priceSpecification;
        if (priceSpec === undefined) {
            throw new factory.errors.NotFound('Order.acceptedOffers.priceSpecification');
        }

        const unitPriceSpec =
            <factory.chevre.priceSpecification.IPriceSpecification<factory.chevre.priceSpecificationType.UnitPriceSpecification>>
            priceSpec.priceComponent.find(
                (p) => p.typeOf === factory.chevre.priceSpecificationType.UnitPriceSpecification
            );
        if (unitPriceSpec === undefined) {
            throw new factory.errors.NotFound('Unit Price Specification in Order.acceptedOffers.priceSpecification');
        }

        // 期間単位としては秒のみ実装
        if (unitPriceSpec.referenceQuantity.unitCode !== factory.unitCode.Sec) {
            throw new factory.errors.NotImplemented('Only \'SEC\' is implemented for priceSpecification.referenceQuantity.unitCode ');
        }
        const referenceQuantityValue = unitPriceSpec.referenceQuantity.value;
        if (typeof referenceQuantityValue !== 'number') {
            throw new factory.errors.NotFound('Order.acceptedOffers.priceSpecification.referenceQuantity.value');
        }
        // プログラム更新日時は、今回のプログラムの所有期限
        const runsAt = moment(params.order.orderDate)
            .add(referenceQuantityValue, 'seconds')
            .toDate();

        orderMembershipTask = {
            data: orderProgramMembershipTaskData,
            executionResults: [],
            name: <factory.taskName.OrderProgramMembership>factory.taskName.OrderProgramMembership,
            numberOfTried: 0,
            project: params.order.project,
            remainingNumberOfTries: 10,
            runsAt: runsAt,
            status: factory.taskStatus.Ready
        };
    }

    return orderMembershipTask;
}
