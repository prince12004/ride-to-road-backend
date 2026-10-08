import { Router } from "express";
import * as adminBlogController from "../../controllers/admin/blog.controller";
import { requirePermission } from "../../middleware/adminAuth";

const router = Router();
router.use(requirePermission("blogs"));

router.get("/", adminBlogController.adminListBlogs);
router.post("/", adminBlogController.prepareBlogBody, adminBlogController.adminCreateBlog);
router.get("/:id", adminBlogController.adminGetBlog);
router.put("/:id", adminBlogController.prepareBlogBody, adminBlogController.adminUpdateBlog);
router.delete("/:id", adminBlogController.adminDeleteBlog);
router.patch("/:id/status", adminBlogController.adminSetBlogStatus);

export default router;
