import { SimilarwebApiReply } from './types/similarweb-api';

/**
 * Takes a domain name, strips off the protocol (http/https), www. and folder, and make it URL safe
 *
 * @param domain Domain name to be cleaned
 * @return Domain name stripped from the unnecessary elements
 */
export function cleanDomain(domain: string): string {
    return encodeURIComponent(domain.trim().replace(/^(?:https?:\/\/)?(?:www\.)?/ig, '').replace(/\/.*$/ig, '').toLowerCase());
}

/**
 * Extracts the month from a date formatted as YYYY-MM-DD
 *
 * @param dateString Date formatted as YYYY-MM-DD
 * @return Month, formatted as YYYY-MM
 */
export function dateToYearMonth(dateString: string): string {
    return dateString.split('-').slice(0, 2).join('-');
}

/**
 * Returns a list with all the months between months passed as parameters (included)
 *
 * @param startMonth Start month (format 'YYYY-mm')
 * @param endMonth End month (format 'YYYY-mm')
 * @return List of months between start and end (format 'YYYY-mm')
 */
export function monthsBetween(startMonth: string, endMonth: string): string[] {
    let months: string[] = [];
    let currentMonth = startMonth;

    while (currentMonth < endMonth) {
        months.push(currentMonth);
        let yearMonth = currentMonth.split('-').map((x): number => parseInt(x, 10));
        currentMonth = yearMonth[1] === 12 ? (yearMonth[0]+1) + '-01' : yearMonth[0] + '-' + ('0'+(yearMonth[1] + 1)).slice(-2);
    }
    months.push(currentMonth);

    return months;
}

export interface UrlDataMap {
    [propName: string]: SimilarwebApiReply;
}

class ChunkyCache {
    private static TIMEOUT: number = 7200; // 2 hours
    private static CHUNK_SIZE: number = 50 * 1024; // max 100kb, 2 bytes per character
    private static cacheService: GoogleAppsScript.Cache.Cache;

    private static instance: ChunkyCache; // singleton

    private constructor() {
        ChunkyCache.cacheService = CacheService.getUserCache();
    }

    public static getInstance(): ChunkyCache {
        if (!ChunkyCache.instance) {
            ChunkyCache.instance = new ChunkyCache();
        }
        return ChunkyCache.instance;
    }

    private static chunkify(key: string, value) {
        let stringifiedValue = JSON.stringify(value);
        let result = {};
        if (stringifiedValue.length < ChunkyCache.CHUNK_SIZE) {
            result[key] = stringifiedValue;
        }
        else {
            let index = 0;
            while (index * ChunkyCache.CHUNK_SIZE < stringifiedValue.length) {
                let chunkKey = key + '_' + index;
                let startIndex = index * ChunkyCache.CHUNK_SIZE;
                result[chunkKey] = stringifiedValue.substr(startIndex, ChunkyCache.CHUNK_SIZE);
                index++;
            }

            let chunksDict = {
                isChunkified: true,
                chunks: Object.keys(result)
            };
            result[key] = JSON.stringify(chunksDict);
        }
        // console.log('ChunkyCache: ', key, ' broken into ', Object.keys(result).length, ' pieces');

        return result;
    }

    private static buildKeyFromUrl(url: string, params?: object): string {
        url = url.toLowerCase();
        if (typeof(params) === 'undefined') {
            var split = url.split('?');
            url = split[0];
            params = {};
            split[1].split('&').forEach(function(param): void {
                let [key, val] = param.split('=');
                params[key] = val;
            });
        }

        function isParamIncluded(param: string): boolean {
            let excludedParams = [
                'api_key',
                'format',
                'show_verified'
            ]

            return excludedParams.indexOf(param) < 0;
        }

        function shortenKey(param: string): string {
            let shortParams = {
                'country': 'c',
                'domain': 'd',
                'end_date': 'ed',
                'start_date': 'sd',
                'granularity': 'g',
                'main_domain_only': 'md',
                'show_verified': 'sv',
                'mode': 'm',
                'device': 'dv',
                'category': 'ca'
            };
        
            return shortParams[param] || param;
        }

        let parString = Object.keys(params)
            .filter(isParamIncluded)
            .sort()
            .map((key): string => `${shortenKey(key)}=${params[key]}`)
            .join('&');
        let shortenedUrl = url.replace(/^https:\/\/api\.similarweb\.com\/v\d+\/(website|keywords|app)\//, '');

        return `${shortenedUrl}?${parString}`;
    }

    /**
     * Takes a key and a value, and stores them in the cache with no restriction on the 
     * data size.
     *
     * @param fullUrl URL whose data we want to store
     * @param value Value returned by the API
     */
    public put(fullUrl: string, value: SimilarwebApiReply): void {
        let key = ChunkyCache.buildKeyFromUrl(fullUrl);
        let chunkified = ChunkyCache.chunkify(key, value);
        try {
            ChunkyCache.cacheService.putAll(chunkified, ChunkyCache.TIMEOUT);
        }
        catch (e) {
            console.error('ChunkyCache: error storing the data for key: ', key, ' - ', e);
        }

        console.log('ChunkyCache: successfully stored data for key: ', key, ' (', Object.keys(chunkified).length, ' chunks)');
    }

    /**
     * Takes an object of URLs/values and stores each of them in the cache, with no restriction on the 
     * data size.
     *
     * @param dict Object mapping the URLs and values to be stored
     */
    public putAll(dict: UrlDataMap): void {
        console.log('ChunkyCache: storing values for ', Object.keys(dict).length, ' urls');
        // chunkify data and store everything in one dict
        let chunkifiedDict = {};
        Object.keys(dict).forEach((url: string): void => {
            let key = ChunkyCache.buildKeyFromUrl(url);
            let chunkifiedVal = ChunkyCache.chunkify(key, dict[url]);
            Object.keys(chunkifiedVal).forEach((chunkKey: string): void => {
                chunkifiedDict[chunkKey] = chunkifiedVal[chunkKey];
            });
        });

        try {
            ChunkyCache.cacheService.putAll(chunkifiedDict, ChunkyCache.TIMEOUT);
        }
        catch (e) {
            console.warn('ChunkyCache: error storing the data for multiple keys - ', e);
        }
    }

    /**
     * Takes a single URL and returns the value stored for that URL, or null if not found
     *
     * @param fullUrl URL (with parameters)
     * @return Data returned after the last successful API call
     */
    public get(fullUrl: string): SimilarwebApiReply {
        let key = ChunkyCache.buildKeyFromUrl(fullUrl);
        console.log('ChunkyCache: getting data for key', key);
        let result;
        try {
            let data = ChunkyCache.cacheService.get(key);

            if (data) {
                result = JSON.parse(data);
                if (result.isChunkified) {
                    if (!result.chunks) {
                        console.error('ChunkyCache: Could not retrieve the chunks for ', key);
                        result = null;
                    }
                    let chunksDict = ChunkyCache.cacheService.getAll(result.chunks);
                    let chunks = result.chunks.map((key: string): string => chunksDict[key]);
                    result = chunks ? JSON.parse(chunks.join('')) : null;
                }
                console.log('ChunkyCache: data retrieved successfully for ', key);
            }
            else {
                console.log('ChunkyCache: No data found for ', key);
            }
        }
        catch (e) {
            console.log('ChunkyCache: Could not retrieve data for key', key, ' - ', e);
        }
        finally {
            return result;
        }
    }

    /**
     * Takes a list of URLs and returns the values stored in cache for each of them. The items not present
     * in hte cache will not be returned in the reply.
     *
     * @param urls List of URLs to be called (with parameters)
     * @return Object mapping the urls with the returned data when available
     */
    public getAll(urls: string[]): UrlDataMap {
        console.log('ChunkyCache: getting data for ', urls.length, ' urls');
        let cacheData;
        let result: UrlDataMap = {};

        let keys = urls.map((url: string): string => ChunkyCache.buildKeyFromUrl(url));

        try {
            cacheData = ChunkyCache.cacheService.getAll(keys);
        }
        catch (e) {
            console.error('ChunkyCache: Could not get chunks keys - ', e);
        }

        let urlChunksKeysMap: [string, string[]][] = [];
        if (cacheData) {
            urls.filter((url: string): boolean => cacheData.hasOwnProperty(ChunkyCache.buildKeyFromUrl(url)))
                .forEach((url: string): void => {
                    let key = ChunkyCache.buildKeyFromUrl(url);
                    let data = JSON.parse(cacheData[key]);

                    if (data.isChunkified) {
                        urlChunksKeysMap.push([url, data.chunks]);
                    }
                    else {
                        result[url] = data;
                    }
                });
        }

        let chunksKeys = [].concat(...urlChunksKeysMap.map((chunkData): string[] => chunkData[1]));

        let chunksData = {};
        try {
            chunksData = ChunkyCache.cacheService.getAll([].concat(...chunksKeys));

            urlChunksKeysMap.forEach((x: [string, string[]]): void => {
                let [url, chunks] = x;
                let mergedData = chunks.map((chunkKey: string): string => chunksData[chunkKey]).join('');
                result[url] = JSON.parse(mergedData) as SimilarwebApiReply;
            });
        }
        catch (e) {
            console.error('ChunkyCache: Could not get chunks data - ', e);
        }

        return result;
    }
}

/**
 * Takes an endpoint URL and an object with the parameters to be added to the HTTP GET request,
 * and returns the full URL with the appended parameters
 *
 * @param url URL to the desired enpoint, without parameters
 * @param params Object with the parameters to be passed in the HTTP GET request
 * @return Full URL with the parameters appended to the endpoint name
 */
export function buildUrl(url: string, params: object = {}): string {
    if (url.indexOf('?') > 0) {
        console.warn('buildUrl: url already does have parameters:', url);
        return url;
    }
    let urlParams = Object.keys(params).map((k): string => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
    let fullUrl = url + (urlParams.length > 0 ? '?' + urlParams : '');
  
    return fullUrl;
}

/**
 * Send a HTTP GET request to an API endpoint and return the results in a JavaScript object
 *
 * @param url URL to be called (either with or without parameters)
 * @param params Object that contains the URL parameters and their values
 * @param retries Number of subsequent retries to perform if the API call fails, default 3
 * @return Results returned by the API, or null if the API call wasn't successful
 */
export function httpGet(url: string, params: object = {}, retries: number = 3): SimilarwebApiReply {
    let fullUrl = buildUrl(url, params);
    console.log('httpGet: Fetching', fullUrl.replace(/api_key=[0-9a-f]{26}/gi, 'api_key=xxxxxxxxxxx'));

    let response: GoogleAppsScript.URL_Fetch.HTTPResponse; // eslint-disable-line @typescript-eslint/camelcase
    let data: SimilarwebApiReply = null;
    
    try {
        response = UrlFetchApp.fetch(fullUrl);
    }
    catch (e) {
        if (retries > 0) {
            console.warn(`Could not get data from API (${retries} attempts left) - `, e);
            data = httpGet(url, params, retries - 1);
        }
        else {
            console.error('Could not get data from API - ', e);
        }
    }
    console.log('httpGet: Retrieved data successfully');

    try {
        data = JSON.parse(response.getContentText());
    }
    catch (e) {
        console.error('Could not parse JSON reply. Exception details: ' + e);
    }

    return data;
}

/**
 * Tries to retrieve the requested data from the cache, and calls the API if not successful
 *
 * @param url URL to be called (either with or without parameters)
 * @param params Object that contains the URL parameters and their values
 * @return Results, or null if the API call wasn't successful
 */
export function retrieveOrGet(url: string , params: object = {}): SimilarwebApiReply {
    let cache = ChunkyCache.getInstance();
    let fullUrl = buildUrl(url, params);
    let data: SimilarwebApiReply;
  
    data = cache.get(fullUrl);
  
    if (!data) {
        data = httpGet(url, params);
        if (data) {
            try {
                cache.put(fullUrl, data);
            }
            catch (e) {
                console.warn('retrieveOrGet: Error when storing in cache - ', url, e);
            }
        }
    }
  
    return data;
}

/**
 * Takes a list of URLs and returns the HTTP GET response for each of them. All the successful results
 * are stored in the cache.
 *
 * @param urls List of URLs to be called
 * @param batchSize Number of urls to be processed at a time (will retrieve at most 1 batch per second)
 * @param retries Number of times the HTTP GET call will be retried if unsuccessful
 * @return Object mapping the urls with the returned data (or null if no data could be retrieved for the url)
 */
export function httpGetAll(urls: string[], batchSize: number = 10, retries: number = 3): UrlDataMap {
    console.log('httpGetAll: calling API for ', urls.length, 'urls - ', retries, ' retries left');
    let cache = ChunkyCache.getInstance();
    let waitlist = urls.slice(0); // clone array
    let result = {};
    let missed = [];
    let batchNum = 1;
    let nbBatches = 1 + Math.floor(waitlist.length/batchSize);

    while (waitlist.length > 0) {
        if (nbBatches > 1) console.log(`httpGetAll: running batch ${batchNum} of ${nbBatches}`);
        let batch = waitlist.splice(0, batchSize); // take the *batchSize* first elements of the urls list
        let requests = batch.map((url: string) => ({ 'url': url, 'method': 'get', 'muteHttpExceptions': true }));

        let responses: GoogleAppsScript.URL_Fetch.HTTPResponse[];
        let startTime = new Date();
        try {
            responses = UrlFetchApp.fetchAll(requests);
        }
        catch(e) {
            console.warn('httpGetAll: error retrieving batch data - ', e);
            missed.concat(batch);
        }

        if (responses) {
            let batchResults = {};
            responses.forEach((response, i): void => {
                let url = batch[i];
                let data;
                if (response.getResponseCode() >= 200 && response.getResponseCode() < 300) {
                    try {
                        data = JSON.parse(response.getContentText()) as SimilarwebApiReply;
                    }
                    catch(e) {
                        console.warn('httpGetAll: error parsing data for url: ', url, ' - ', e);
                        data = null;
                    }

                    result[url] = data;
                    batchResults[url] = data;
                }
                else {
                    console.warn('httpGetAll: http error for url ', url, ' - response code: ', response.getResponseCode());
                    missed.push(url);
                }
            });
            
            let nbSuccessfulResults = Object.keys(batchResults).length;
            if (cache && nbSuccessfulResults > 0) {
                cache.putAll(batchResults);
            }
        }

        // If less than a second has elapsed, wait before running next batch
        let endTime = new Date();
        let timeDiff = endTime.getTime() - startTime.getTime();
        if (timeDiff < 1000) {
            // console.log(`httpGetAll: wait ${1000 - timeDiff} ms before next batch`);
            Utilities.sleep(1000 - timeDiff);
        }

        batchNum++;
    }

    if (missed.length > 0) {
        if (retries > 0) {
            console.log('httpGetAll: ', missed.length, ' failed requests, ', retries, ' retries left');
            let retryResults = httpGetAll(missed, batchSize, retries-1);
            Object.keys(retryResults).forEach((url: string): void => {
                result[url] = retryResults[url];
            });
        }
        else {
            missed.forEach((url: string): void => result[url] = null);
        }
    }

    return result;
}

/**
 * Takes a list of URLs and returns the HTTP GET response for each of them, retrieving them from the cache
 * when possible or by calling the API otherwise.
 *
 * @param urls List of URLs to be called
 * @param batchSize Number of urls to be processed at a time (will retrieve at most 1 batch per second)
 * @param retries Number of times the HTTP GET call will be retried if unsuccessful
 * @return Object mapping the urls with the returned data (or null if no data could be retrieved for the url)
 */
export function retrieveOrGetAll(urls: string[], batchSize: number = 10, retries: number = 3) {
    console.log(`retrieveOrGetAll: getting data for ${urls.length} URLs`);
    let cache = ChunkyCache.getInstance();
    let result = cache.getAll(urls);

    let missed = urls.filter((url: string): boolean => (!result.hasOwnProperty(url) || !result[url]));
    console.log(`retrieveOrGetAll: retrieved data for ${urls.length - missed.length}/${urls.length} URLs in the cache`);

    if (missed.length > 0) {
        let apiResponses = httpGetAll(missed, batchSize);

        missed.forEach((url: string): void => {
            result[url] = apiResponses[url] || null;
        });
    }

    return result;
}

export class Set {
    private set = {};

    public constructor(values: string[] = []) {
        values.forEach((value) => { this.set[value] = true; });
    }

    public add(value: string | string[]): Set {
        if (value instanceof Array) {
            value.forEach((val) => {this.set[val]; });
        }
        else {
            this.set[value] = true;
        }
        return this;
    }

    public getValues(): string[] {
        return Object.keys(this.set);
    }
}