import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import familyRouter from "./family";
import propertiesRouter from "./properties";
import choresRouter from "./chores";
import groceryRouter from "./grocery";
import mealsRouter from "./meals";
import todosRouter from "./todos";
import maintenanceRouter from "./maintenance";
import aiRouter from "./ai";
import pushTokensRouter from "./pushTokens";
import meRouter from "./me";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(familyRouter);
router.use(propertiesRouter);
router.use(choresRouter);
router.use(groceryRouter);
router.use(mealsRouter);
router.use(todosRouter);
router.use(maintenanceRouter);
router.use(aiRouter);
router.use(pushTokensRouter);
router.use(meRouter);

export default router;
