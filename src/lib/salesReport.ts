// «Продажі» report — shared types.
export interface SaleRow {
  id: string; n: number; name: string;
  src: string; ad: boolean; camp: string | null;
  eur: number;
  created: string; kp: string | null; sold: string; // ISO
  days: number;          // lead came → sold
  kpDays: number | null; // КП → sold
}
export interface SalesData { from: string; to: string; adTypes: { name: string; color: string }[]; sales: SaleRow[] }
