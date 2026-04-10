import { withClient, type ProcessingJobRow } from './db';

export async function claimJobById(jobId: string) {
  return withClient(async (client) => {
    await client.query('begin');
    try {
      const result = await client.query<ProcessingJobRow>(
        `update processing_jobs
         set status = 'processing',
             updated_at = now(),
             error_code = null,
             error_message_safe = null
         where id = $1
           and status in ('uploaded', 'failed_retryable')
         returning *`,
        [jobId]
      );
      await client.query('commit');
      return result.rows[0] ?? null;
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}
