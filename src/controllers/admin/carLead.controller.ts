import { CarLead } from "../../models/CarLead";
import { createCrudController } from "../../utils/crudFactory";

export const carLeadController = createCrudController(CarLead, {
  moduleName: "carLead",
  searchFields: ["name", "mobile", "carMakeModel", "registrationNumber", "city"],
});
