import { existsSync, readFileSync } from 'node:fs';

const DEFAULT_TOPICS = ['AI', '半導體', '氣候科技'];
const DEFAULT_CRON = '0 7 * * *';

export function splitCsv(value) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadDotEnv(filePath = '.env') {
  if (!existsSync(filePath)) {
    return;
  }

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = trimmedLine.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

export function getConfig(env = process.env) {
  loadDotEnv();
  const topics = splitCsv(env.NEWS_TOPICS);
  const feeds = splitCsv(env.NEWS_FEEDS);

  return {
    port: Number.parseInt(env.PORT || '3000', 10),
    defaultTopics: topics.length > 0 ? topics : DEFAULT_TOPICS,
    cronExpression: env.NEWS_CRON || DEFAULT_CRON,
    runOnStart: env.NEWS_RUN_ON_START === 'true',
    maxItemsPerTopic: Number.parseInt(env.NEWS_MAX_ITEMS_PER_TOPIC || '25', 10),
    extraFeeds: feeds
  };
}
