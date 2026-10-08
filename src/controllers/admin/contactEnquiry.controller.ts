import { ContactEnquiry } from "../../models/ContactEnquiry";
import { createCrudController } from "../../utils/crudFactory";

export const contactEnquiryController = createCrudController(ContactEnquiry, {
  moduleName: "contactEnquiry",
  searchFields: ["name", "mobile", "email"],
});
