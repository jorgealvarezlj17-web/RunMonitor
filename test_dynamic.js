async function test() {
  const { format } = await import('date-fns');
  const { es } = await import('date-fns/locale/es');
  console.log(format(new Date(), "EEEE d", { locale: es }));
}
test();
