import { Router } from "express";
import {
  getUser,
  getUserPortfolio,
} from "../controllers/users.js";

export const usersRouter = Router();

usersRouter.get("/:address", getUser);
usersRouter.get("/:address/portfolio", getUserPortfolio);
