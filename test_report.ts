import { format } from "date-fns";
import { es } from "date-fns/locale/es";

console.log(format(new Date(), "EEEE d", { locale: es }));
