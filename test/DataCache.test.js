import DataCache from '../src/DataCache.js';

/**
 * Emulate Cache Service
 */
class UserCache {
  constructor () {
    this.cacheDict = {};
  }
  get(key) {
    return this.cacheDict[key];
  }

  // eslint-disable-next-line no-unused-vars
  put(key, value, expiration) {
    this.cacheDict[key] = value;
  }

  remove(key) {
    delete this.cacheDict[key];
  }
}

function generateData(arraySize) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < arraySize; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
}

test('testCache', () => {
  var cacheService = new UserCache();
  var cache = new DataCache(cacheService, '0123456789abcdef0123456789abcdef', 'toto.com', 'us');

  cache.set('my_data');
  expect(cache.get()).toBe('my_data');
});

test('testCacheChunks', () => {
  var cacheService = new UserCache();
  var data = generateData(Math.max((3 * DataCache.MAX_CACHE_SIZE) - 10), 1);
  var cache = new DataCache(cacheService, '0123456789abcdef0123456789abcdef', 'bla.com', 'us');

  cache.set(data);
  expect(cache.get()).toBe(data);
});
