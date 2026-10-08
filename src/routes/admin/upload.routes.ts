import { Router } from "express";
import * as uploadController from "../../controllers/admin/upload.controller";
import { upload } from "../../middleware/upload";

const router = Router();
router.post("/", upload.single("file"), uploadController.uploadImage);
router.post("/delete", uploadController.deleteImage);

export default router;
