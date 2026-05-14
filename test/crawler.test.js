import test from 'node:test';
import assert from 'node:assert/strict';
import { googleNewsFeedForTopic, itemMatchesTopic, mergeNews, normalizeText, toNewsItem } from '../src/crawler.js';
import { splitCsv } from '../src/config.js';

test('splitCsv trims empty values', () => {
  assert.deepEqual(splitCsv(' AI, 半導體 ,, climate '), ['AI', '半導體', 'climate']);
});

test('normalizeText removes html and repeated spaces', () => {
  assert.equal(normalizeText('<p>Hello   <strong>news</strong></p>'), 'Hello news');
});

test('googleNewsFeedForTopic encodes topic', () => {
  assert.equal(
    googleNewsFeedForTopic('氣候 科技'),
    'https://news.google.com/rss/search?q=%E6%B0%A3%E5%80%99%20%E7%A7%91%E6%8A%80&hl=zh-TW&gl=TW&ceid=TW:zh-Hant'
  );
});

test('itemMatchesTopic searches title and content case-insensitively', () => {
  assert.equal(itemMatchesTopic({ title: 'OpenAI launches model' }, 'openai'), true);
  assert.equal(itemMatchesTopic({ title: 'Market update' }, 'openai'), false);
});

test('toNewsItem creates normalized news item', () => {
  assert.deepEqual(
    toNewsItem({ title: '<b>Title</b>', link: 'https://example.com', contentSnippet: ' Summary ', isoDate: '2026-05-13T00:00:00.000Z' }, 'AI', 'Example Feed'),
    {
      id: 'AI:https://example.com',
      topic: 'AI',
      title: 'Title',
      link: 'https://example.com',
      source: 'Example Feed',
      publishedAt: '2026-05-13T00:00:00.000Z',
      summary: 'Summary'
    }
  );
});

test('mergeNews deduplicates by topic and link', () => {
  const merged = mergeNews(
    [{ topic: 'AI', link: 'same', title: 'Old', publishedAt: '2024-01-01T00:00:00.000Z' }],
    [{ topic: 'AI', link: 'same', title: 'New', publishedAt: '2024-01-02T00:00:00.000Z' }]
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].title, 'New');
});
