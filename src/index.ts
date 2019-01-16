// tslint:disable:max-classes-per-file completed-docs
/**
 * domain index
 */
import * as GMO from '@motionpicture/gmo-service';
import * as mvtkreserveapi from '@movieticket/reserve-api-nodejs-client';
import * as pecorinoapi from '@pecorino/api-nodejs-client';
import * as AWS from 'aws-sdk';
import * as mongoose from 'mongoose';
import * as redis from 'redis';

import * as chevre from './chevre';
import * as errorHandler from './errorHandler';
import * as factory from './factory';
import * as repository from './repository';
import * as service from './service';

/**
 * MongoDBクライアント`mongoose`
 * @example
 * var promise = domain.mongoose.connect('mongodb://localhost/myapp', {
 *     useMongoClient: true
 * });
 */
export import mongoose = mongoose;
/**
 * Redis Cacheクライアント
 * @example
 * const client = domain.redis.createClient({
 *      host: process.env.REDIS_HOST,
 *      port: process.env.REDIS_PORT,
 *      password: process.env.REDIS_KEY,
 *      tls: { servername: process.env.TEST_REDIS_HOST }
 * });
 */
export import redis = redis;
/**
 * GMOのAPIクライアント
 * @example
 * domain.GMO.services.card.searchMember({
 *     siteId: '',
 *     sitePass: '',
 *     memberId: ''
 * }).then((result) => {
 *     console.log(result);
 * });
 */
export import GMO = GMO;
/**
 * Pecorino APIクライアント
 * Pecorinoサービスとの連携は全てこのクライアントを通じて行います。
 */
export import pecorinoapi = pecorinoapi;
export import chevre = chevre;
export import mvtkreserveapi = mvtkreserveapi;
/**
 * AWS SDK
 */
export import AWS = AWS;

export import errorHandler = errorHandler;
export import factory = factory;
export import repository = repository;
export import service = service;
