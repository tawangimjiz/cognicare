'use client';
import { useParams } from 'next/navigation';
import { ReportView } from '../../../../components/doctor/ReportView';

export default function ReportPage() {
  const { patientId } = useParams<{ patientId: string }>();
  return <ReportView patientId={patientId} />;
}
