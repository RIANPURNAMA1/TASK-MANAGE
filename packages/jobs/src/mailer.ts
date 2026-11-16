import nodemailer from 'nodemailer';
import type { JobLogger, OutgoingMail } from './context';

export interface MailerConfig {
  host?: string;
  port: number;
  user?: string;
  password?: string;
  from: string;
}

/**
 * SMTP mailer. Without an SMTP host (local development) emails are printed to the log
 * instead, so verification/invitation/reset links are still usable.
 */
export function createMailer(config: MailerConfig, logger: JobLogger) {
  if (!config.host) {
    return {
      async send(mail: OutgoingMail) {
        logger.info(`\n──── EMAIL (dev, tidak dikirim) ────\nKepada : ${mail.to}\nSubjek : ${mail.subject}\n\n${mail.text}\n────────────────────────────────────`);
      },
      close() {},
    };
  }

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
  });
  return {
    async send(mail: OutgoingMail) {
      await transport.sendMail({ from: config.from, ...mail });
    },
    close() {
      transport.close();
    },
  };
}
