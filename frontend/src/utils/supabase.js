import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hekpzzqmqttlirrvxltn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zZ6ov7uTrs3xNZUL00Yx4w_wWVBMmDk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
