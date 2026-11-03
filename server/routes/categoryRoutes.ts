import  {Router} from 'express';
import { getCategories,deleteCategories,createCategory } from '../controllers/categoryController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const categoryRouter = Router();

//public /customer can view categories
categoryRouter.get('/', getCategories);


//merchant can create and delete categories
categoryRouter.post('/', requireAuth, requireRole(['merchant']), createCategory);
categoryRouter.delete('/:id', requireAuth, requireRole(['merchant']), deleteCategories);


export default categoryRouter;