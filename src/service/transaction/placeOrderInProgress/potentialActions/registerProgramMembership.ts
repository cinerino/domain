import * as moment from 'moment';

import * as factory from '../../../../factory';

export function createRegisterProgramMembershipActions(params: {
    transaction: factory.transaction.placeOrder.ITransaction;
    order: factory.order.IOrder;
    potentialActions?: factory.transaction.placeOrder.IPotentialActionsParams;
}): factory.action.interact.register.programMembership.IAttributes[] {
    const project: factory.project.IProject = params.transaction.project;

    // 会員プログラムが注文アイテムにあれば、会員プログラム登録アクションを追加
    const registerProgramMembershipActions: factory.action.interact.register.programMembership.IAttributes[] = [];
    const programMembershipOffers = <factory.order.IAcceptedOffer<factory.programMembership.IProgramMembership>[]>
        params.order.acceptedOffers.filter(
            (o) => o.itemOffered.typeOf === factory.programMembership.ProgramMembershipType.ProgramMembership
        );
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore if */
    if (programMembershipOffers.length > 0) {
        // tslint:disable-next-line:cyclomatic-complexity max-func-body-length
        registerProgramMembershipActions.push(...programMembershipOffers.map((o) => {
            const programMembership = o.itemOffered;

            // 会員プログラム更新時のメール送信アクション
            let sendEmailMessageOnUpdate: factory.transaction.placeOrder.ISendEmailMessageParams[] = [];

            if (Array.isArray(params.potentialActions?.order?.potentialActions?.sendOrder?.potentialActions?.registerProgramMembership)) {
                const registerParams =
                    params.potentialActions?.order?.potentialActions?.sendOrder?.potentialActions?.registerProgramMembership.find((r) => {
                        return r.object !== undefined
                            && r.object.membershipFor?.id === programMembership.membershipFor?.id
                            && r.object.typeOf === programMembership.typeOf;
                    });
                if (registerParams !== undefined) {
                    const registerPotentialActions = registerParams.potentialActions;
                    if (registerPotentialActions?.orderProgramMembership?.potentialActions?.order !== undefined) {
                        const orderProgramMembershipPotentialActions =
                            registerPotentialActions.orderProgramMembership.potentialActions.order.potentialActions;
                        const sendEmailMessageOnSentParams =
                            orderProgramMembershipPotentialActions?.sendOrder?.potentialActions?.sendEmailMessage;
                        if (Array.isArray(sendEmailMessageOnSentParams)) {
                            sendEmailMessageOnUpdate = sendEmailMessageOnSentParams;
                        }
                    }
                }
            }

            if (programMembership.membershipFor === undefined) {
                throw new Error('programMembership.membershipFor undefined');
            }

            // 次回の会員プログラム注文確定後アクションを設定
            const updateProgramMembershipPotentialActions: factory.transaction.placeOrder.IPotentialActionsParams = {
                order: {
                    potentialActions: {
                        sendOrder: {
                            potentialActions: {
                                registerProgramMembership: [
                                    {
                                        object: { typeOf: programMembership.typeOf, membershipFor: programMembership.membershipFor },
                                        potentialActions: {
                                            orderProgramMembership: {
                                                potentialActions: {
                                                    order: {
                                                        potentialActions: {
                                                            sendOrder: {
                                                                potentialActions: {
                                                                    sendEmailMessage: sendEmailMessageOnUpdate
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                ],
                                sendEmailMessage: sendEmailMessageOnUpdate
                            }
                        }
                    }
                }
            };

            // 次回の会員プログラム注文タスクを生成
            const orderProgramMembershipTaskData: factory.task.IData<factory.taskName.OrderProgramMembership> = {
                agent: params.transaction.agent,
                object: o,
                potentialActions: updateProgramMembershipPotentialActions,
                project: project,
                typeOf: factory.actionType.OrderAction
            };

            // どういう期間でいくらのオファーなのか
            const priceSpec =
                <factory.chevre.compoundPriceSpecification.IPriceSpecification<any>>
                o.priceSpecification;
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

            const orderProgramMembershipTask: factory.task.IAttributes<factory.taskName.OrderProgramMembership> = {
                data: orderProgramMembershipTaskData,
                executionResults: [],
                name: <factory.taskName.OrderProgramMembership>factory.taskName.OrderProgramMembership,
                numberOfTried: 0,
                project: project,
                remainingNumberOfTries: 10,
                runsAt: runsAt,
                status: factory.taskStatus.Ready
            };

            return {
                agent: params.transaction.agent,
                object: {
                    typeOf: programMembership.typeOf,
                    // id: programMembership.id,
                    hostingOrganization: programMembership.hostingOrganization,
                    name: programMembership.name,
                    programName: programMembership.programName,
                    project: programMembership.project,
                    membershipFor: programMembership.membershipFor
                },
                potentialActions: {
                    orderProgramMembership: [orderProgramMembershipTask]
                },
                project: project,
                purpose: {
                    typeOf: params.order.typeOf,
                    orderNumber: params.order.orderNumber
                },
                typeOf: <factory.actionType.RegisterAction>factory.actionType.RegisterAction
            };
        }));
    }

    return registerProgramMembershipActions;
}
