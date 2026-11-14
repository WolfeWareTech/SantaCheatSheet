import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';
import { directoryApi } from './api';
/** Call once after the app's existing Amplify configuration; memoize per signed-in session. */
export function createDirectoryApi() { return directoryApi(generateClient<Schema>()); }
