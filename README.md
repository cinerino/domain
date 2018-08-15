# Cinerino Domain Library for Node.js

[![npm (scoped)](https://img.shields.io/npm/v/@cinerino/domain.svg)](https://www.npmjs.com/package/@cinerino/domain)
[![CircleCI](https://circleci.com/gh/cinerino/domain.svg?style=svg)](https://circleci.com/gh/cinerino/domain)
[![Coverage Status](https://coveralls.io/repos/github/cinerino/domain/badge.svg?branch=master)](https://coveralls.io/github/cinerino/domain?branch=master)
[![Dependency Status](https://img.shields.io/david/cinerino/domain.svg)](https://david-dm.org/cinerino/domain)
[![Known Vulnerabilities](https://snyk.io/test/github/cinerino/domain/badge.svg)](https://snyk.io/test/github/cinerino/domain)
[![npm](https://img.shields.io/npm/dm/@cinerino/domain.svg)](https://nodei.co/npm/@cinerino/domain/)

CinerinoのバックエンドサービスをNode.jsで簡単に使用するためのパッケージを提供します。

## Table of contents

* [Usage](#usage)
* [Code Samples](#code-samples)
* [License](#license)

## Usage

```shell
npm install @cinerino/domain
```

### Environment variables

| Name                                 | Required | Value    | Purpose                |
|--------------------------------------|----------|----------|------------------------|
| `DEBUG`                              | false    | domain:* | Debug                  |
| `NODE_ENV`                           | true     |          | environment name       |
| `MONGOLAB_URI`                       | true     |          | MongoDB connection URI |
| `SENDGRID_API_KEY`                   | true     |          | SendGrid API Key       |
| `GMO_ENDPOINT`                       | true     |          | GMO API endpoint       |
| `GMO_SITE_ID`                        | true     |          | GMO SiteID             |
| `GMO_SITE_PASS`                      | true     |          | GMO SitePass           |
| `DEVELOPER_LINE_NOTIFY_ACCESS_TOKEN` | true     |          | 開発者通知用LINEアクセストークン     |
| `WAITER_SECRET`                      | true     |          | WAITER許可証トークン秘密鍵       |
| `WAITER_PASSPORT_ISSUER`             | true     |          | WAITER許可証発行者           |
| `ORDER_INQUIRY_ENDPOINT`             | true     |          | 注文照会エンドポイント            |

### Search screening events sample

```js
const cinerino = require('@cinerino/domain');

cinerino.mongoose.connect('MONGOLAB_URI');
const redisClient = cinerino.redis.createClient({
    host: '*****',
    port: 6380,
    password: '*****',
    tls: { servername: 6380 }
});

const eventRepo = new cinerino.repository.Event(cinerino.mongoose.connection);
const itemAvailabilityRepo = new cinerino.repository.itemAvailability.ScreeningEvent(redisClient);

cinerino.service.offer.searchlScreeningEvents({
    superEventLocationIdentifiers:['MovieTheater-118'],
    startFrom: new Date(),
    startThrough: new Date(),
})({
    event: eventRepo,
    itemAvailability: itemAvailabilityRepo
})
    .then((events) => {
        console.log('events:', events);
    });
```

## Code Samples

Code sample are [here](https://github.com/cinerino/domain/tree/master/example).

## License

ISC
