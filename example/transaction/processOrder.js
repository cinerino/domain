const domain = require('../../lib');
const moment = require('moment');

async function main() {
    await domain.mongoose.connect(process.env.MONGOLAB_URI);
    const redisClient = domain.redis.createClient({
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        password: process.env.REDIS_KEY,
        tls: { servername: process.env.REDIS_HOST }
    });

    const actionRepo = new domain.repository.Action(domain.mongoose.connection);
    const eventRepo = new domain.repository.Event(domain.mongoose.connection);
    const organizationRepo = new domain.repository.Organization(domain.mongoose.connection);
    const transactionRepo = new domain.repository.Transaction(domain.mongoose.connection);
    const orderNumberRepo = new domain.repository.OrderNumber(redisClient);
    const eventService = new domain.chevre.service.Event({
        endpoint: process.env.CHEVRE_ENDPOINT,
        auth: new domain.chevre.auth.ClientCredentials({
            domain: process.env.CHEVRE_AUTHORIZE_SERVER_DOMAIN,
            clientId: process.env.CHEVRE_CLIENT_ID,
            clientSecret: process.env.CHEVRE_CLIENT_SECRET,
            scopes: [],
            state: ''
        })
    });
    const reserveService = new domain.chevre.service.transaction.Reserve({
        endpoint: process.env.CHEVRE_ENDPOINT,
        auth: new domain.chevre.auth.ClientCredentials({
            domain: process.env.CHEVRE_AUTHORIZE_SERVER_DOMAIN,
            clientId: process.env.CHEVRE_CLIENT_ID,
            clientSecret: process.env.CHEVRE_CLIENT_SECRET,
            scopes: [],
            state: ''
        })
    });

    // 販売者検索
    const sellers = await organizationRepo.searchMovieTheaters({});
    console.log(sellers.length, 'sellers found');
    const seller = sellers[0];

    // イベント検索
    const screeningEvents = await eventRepo.searchScreeningEvents({
        // superEventLocationIdentifiers: [seller.identifier],
        startFrom: moment().toDate(),
        // tslint:disable-next-line:no-magic-numbers
        startThrough: moment().add(1, 'week').toDate()
    });
    console.log(screeningEvents.length, 'events found');
    const screeningEvent = screeningEvents[0];
    console.log('screeningEvent:', screeningEvent);

    const transaction = await domain.service.transaction.placeOrderInProgress.start({
        expires: moment().add(5, 'minutes').toDate(),
        customer: {
            typeOf: domain.factory.personType.Person,
            id: 'personId',
            // memberOf?: ProgramMembershipFactory.IProgramMembership;
            // url?: string;
        },
        seller: {
            typeOf: seller.typeOf,
            id: seller.id
        },
        clientUser: {}
        // passportToken?: waiter.factory.passport.IEncodedPassport;
    })({
        organization: organizationRepo,
        transaction: transactionRepo
    });
    console.log('transaction started', transaction.id);

    // 券種検索
    console.log('searching event ticket types...', screeningEvent.id);
    const ticketTypes = await eventService.searchScreeningEventTicketTypes({ eventId: screeningEvent.id });
    console.log(ticketTypes.length, 'ticket types found');
    const ticketType = ticketTypes[0];

    const offers = await eventService.searchScreeningEventOffers({ eventId: screeningEvent.id });
    console.log('offers:', offers);
    const seatOffers = offers[0].containsPlace;
    console.log(seatOffers.length, 'seatOffers found');
    const availableSeatOffers = seatOffers.filter((o) => o.offers[0].availability === domain.factory.chevre.itemAvailability.InStock);
    console.log(availableSeatOffers.length, 'availableSeatOffers found');

    const authorizeSeatReservationOfferAction = await domain.service.transaction.placeOrderInProgress.action.authorize.offer.seatReservation.create({
        agentId: transaction.agent.id,
        transactionId: transaction.id,
        event: {
            id: screeningEvent.id
        },
        tickets: [
            {
                ticketType: {
                    id: ticketType.id
                },
                ticketedSeat: {
                    seatNumber: availableSeatOffers[0].branchCode,
                    seatSection: offers[0].branchCode
                }
            }
        ],
        notes: 'test from samples'
    })({
        action: actionRepo,
        event: eventRepo,
        transaction: transactionRepo,
        reserveService: reserveService
    });
    console.log('seat reservation authorized', authorizeSeatReservationOfferAction);

    let creditCardAuthorization = await domain.service.transaction.placeOrderInProgress.action.authorize.paymentMethod.creditCard.create({
        agentId: transaction.agent.id,
        transactionId: transaction.id,
        orderId: moment().unix(),
        amount: ticketType.charge,
        method: domain.GMO.utils.util.Method.Lump,
        creditCard: {
            cardNo: '4111111111111111',
            // cardPass?: string;
            expire: '2412',
            holderName: 'AA BB'
        }
    })({
        action: actionRepo,
        organization: organizationRepo,
        transaction: transactionRepo
    });
    console.log('credit card authorized', creditCardAuthorization);

    await domain.service.transaction.placeOrderInProgress.setCustomerContact({
        agentId: transaction.agent.id,
        transactionId: transaction.id,
        contact: {
            givenName: 'Taro',
            familyName: 'Motion',
            telephone: '+819012345678s',
            email: 'hello@motionpicture.jp'
        }
    })({
        transaction: transactionRepo
    });

    await domain.service.transaction.placeOrderInProgress.confirm({
        agentId: transaction.agent.id,
        transactionId: transaction.id,
        orderDate: new Date()
    })({
        action: actionRepo,
        transaction: transactionRepo,
        organization: organizationRepo,
        orderNumber: orderNumberRepo
    });
    console.log('transaction confirmed');

    await domain.mongoose.disconnect();
    redisClient.quit();
}

main().then(() => {
    console.log('success!');
}).catch(console.error);
