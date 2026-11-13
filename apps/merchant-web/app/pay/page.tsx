import type { Metadata } from 'next';
import { Checkout } from '../../components/checkout';

export const metadata: Metadata = {
  title: 'Test checkout | Payflow',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function CheckoutPage() {
  return <Checkout />;
}
