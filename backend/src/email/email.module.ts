import { Global, Module, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend?: Resend;
  private from: string;
  private logToConsole: boolean;

  constructor(private readonly config: ConfigService) {
    this.from = this.config.get<string>('SMTP_FROM') ?? 'Prima Data Portal <onboarding@resend.dev>';
    this.logToConsole = this.config.get('EMAIL_LOG_TO_CONSOLE') === 'true';

    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (apiKey && !this.logToConsole) {
      this.resend = new Resend(apiKey);
      this.logger.log(`Email transport: Resend HTTP API (from: ${this.from})`);
    } else {
      this.logger.warn('Email transport: CONSOLE (no RESEND_API_KEY set) — emails will be logged only');
    }
  }

  async send(to: string, subject: string, html: string, text?: string): Promise<void> {
    if (this.logToConsole || !this.resend) {
      this.logger.log(`\n────── EMAIL (console mode) ──────`);
      this.logger.log(`To:      ${to}`);
      this.logger.log(`Subject: ${subject}`);
      this.logger.log(`Body:\n${text ?? html.replace(/<[^>]+>/g, '')}`);
      this.logger.log(`──────────────────────────────────\n`);
      return;
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        html,
        text,
      });

      if (error) {
        this.logger.error(`Resend rejected email to ${to}: ${JSON.stringify(error)}`);
        return;
      }
      this.logger.log(`✉  Email sent to ${to} — id: ${data?.id ?? 'unknown'}`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${(err as Error).message}`);
      this.logger.error((err as Error).stack);
    }
  }

  async sendInvite(to: string, name: string, inviteUrl: string): Promise<void> {
    const subject = 'Welcome to Prima Data Portal — Set your password';
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#A41D2C">Prima Data Portal</h2>
        <p>Hi ${name},</p>
        <p>You've been invited to access the Prima Data Portal. Click the link below to set your password and activate your account:</p>
        <p><a href="${inviteUrl}" style="display:inline-block;padding:10px 20px;background:#A41D2C;color:#fff;text-decoration:none;border-radius:6px">Set up my account</a></p>
        <p style="color:#6b7280;font-size:13px">This link expires in 7 days.<br>If you didn't expect this email, you can ignore it.</p>
      </div>`;
    return this.send(to, subject, html);
  }

  async sendPasswordReset(to: string, name: string, resetUrl: string): Promise<void> {
    const subject = 'Prima Data Portal — Password reset request';
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#A41D2C">Password reset</h2>
        <p>Hi ${name},</p>
        <p>We received a request to reset your password. Click the link below to set a new one:</p>
        <p><a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background:#A41D2C;color:#fff;text-decoration:none;border-radius:6px">Reset password</a></p>
        <p style="color:#6b7280;font-size:13px">This link expires in 1 hour.<br>If you didn't request this, you can ignore this email.</p>
      </div>`;
    return this.send(to, subject, html);
  }
}

@Global()
@Module({ providers: [EmailService], exports: [EmailService] })
export class EmailModule {}