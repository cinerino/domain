// tslint:disable:max-classes-per-file completed-docs
/**
 * domain index
 */
import * as COA from '@motionpicture/coa-service';
import * as GMO from '@motionpicture/gmo-service';
import * as mvtkreserveapi from '@movieticket/reserve-api-nodejs-client';
import * as pecorinoapi from '@pecorino/api-nodejs-client';
import * as AWS from 'aws-sdk';

import * as chevre from './chevre';
import { credentials as cred } from './credentials';
import * as errorHandler from './errorHandler';
import * as factory from './factory';
import * as repository from './repository';
import * as service from './service';

/**
 * COA APIクライアント
 */
export import COA = COA;

/**
 * GMOのAPIクライアント
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

export const credentials = cred;
export import errorHandler = errorHandler;
export import factory = factory;
export import repository = repository;
export import service = service;
