export const Env = {
    PORT: 'PORT',
    DB_HOST: 'DB_HOST',
    DB_PORT: 'DB_PORT',
    DB_DATABASE: 'DB_DATABASE',
    AWS_BUCKET_REGION: 'AWS_BUCKET_REGION',
    AWS_BUCKET_NAME: 'AWS_BUCKET_NAME',
    AWS_ACCESS_KEY_ID: 'AWS_ACCESS_KEY_ID',
    AWS_SECRET_ACCESS_KEY: 'AWS_SECRET_ACCESS_KEY',
} as const;

export type Env = (typeof Env)[keyof typeof Env];
