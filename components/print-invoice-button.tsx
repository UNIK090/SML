'use client'

// Browser printing is the most reliable way to support both thermal receipt
// printers and A4 printers: the operating system owns printer selection,
// paper size, copies, and any installed printer driver options.

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui'
import { usePreferences } from '@/components/preferences'

export default function PrintInvoiceButton({ className = '' }: { className?: string }) {
  const { t } = usePreferences()

  return (
    <Button onClick={() => window.print()} className={className}>
      <Printer className="size-4" /> {t('invoice.print')}
    </Button>
  )
}
