// Short relative time in Ukrainian: «щойно», «16 хв тому», «3 год тому», «1 дн тому», «2 тиж тому», «4 міс тому», «2 р тому».
// Future dates get «через …».
export function timeAgo(date: string | number | Date, now: number = Date.now()): string {
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = now - t;
  const sec = Math.round(Math.abs(diff) / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);

  let value: string;
  if (sec < 45) return "щойно";
  else if (min < 60) value = `${Math.max(1, min)} хв`;
  else if (hour < 24) value = `${hour} год`;
  else if (day < 7) value = `${day} дн`;
  else if (day < 30) value = `${Math.floor(day / 7)} тиж`;
  else if (day < 365) value = `${Math.max(1, Math.floor(day / 30))} міс`;
  else value = `${Math.floor(day / 365)} р`;

  return diff >= 0 ? `${value} тому` : `через ${value}`;
}
