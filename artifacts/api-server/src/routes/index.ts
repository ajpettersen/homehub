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
import workoutsRouter from "./workouts";
import pushTokensRouter from "./pushTokens";
import meRouter from "./me";
import recipesRouter from "./recipes";

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
router.use(workoutsRouter);
router.use(pushTokensRouter);
router.use(meRouter);
router.use(recipesRouter);

export default router;
