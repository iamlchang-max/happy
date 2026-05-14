import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const NEWS_FILE = path.join(DATA_DIR, 'news.json');
const TOPICS_FILE = path.join(DATA_DIR, 'topics.json');

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }

    throw error;
  }
}

async function writeJson(filePath, data) {
  await ensureDataDir();
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export async function getTopics(defaultTopics) {
  const storedTopics = await readJson(TOPICS_FILE, null);
  if (Array.isArray(storedTopics) && storedTopics.length > 0) {
    return storedTopics;
  }

  await saveTopics(defaultTopics);
  return defaultTopics;
}

export async function saveTopics(topics) {
  const uniqueTopics = [...new Set(topics.map((topic) => topic.trim()).filter(Boolean))];
  await writeJson(TOPICS_FILE, uniqueTopics);
  return uniqueTopics;
}

export async function addTopic(topic, defaultTopics) {
  const topics = await getTopics(defaultTopics);
  return saveTopics([...topics, topic]);
}

export async function removeTopic(topic, defaultTopics) {
  const topics = await getTopics(defaultTopics);
  return saveTopics(topics.filter((item) => item !== topic));
}

export async function getNews() {
  return readJson(NEWS_FILE, []);
}

export async function saveNews(items) {
  await writeJson(NEWS_FILE, items);
  return items;
}
