// Minimal typing for the nodemailer API used by OTP delivery (avoids the large @types tree).
declare module "nodemailer" {
  interface Transporter { sendMail(opts: Record<string, unknown>): Promise<unknown> }
  const nodemailer: { createTransport(opts: Record<string, unknown>): Transporter };
  export default nodemailer;
}
